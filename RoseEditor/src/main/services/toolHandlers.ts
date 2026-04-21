import { readFile, writeFile, readdir } from 'fs/promises'
import { join, relative, basename } from 'path'
import { execSync } from 'child_process'
import { platform } from 'os'
import { BrowserWindow } from 'electron'
import { roseLibraryClient, setActiveProjectRoot } from './roseLibraryClient'
import { isIndexableFile } from './fileService'
import { IPC } from '../../shared/ipcChannels'
import { readSettings } from '../ipc/settingsHandlers'
import {
  withImapClient,
  readEmailFilters,
  readEmailMeta,
  writeEmailMeta,
  matchesSpamRule,
  matchesInjectionPattern,
  fetchEmailBody,
  type EmailSummary
} from './emailService'
import { fetchDiscordChannels, fetchDiscordMessages, sendDiscordMessage } from './discordService'

const modifiedFiles: string[] = []

export function resetModifiedFiles(): void {
  modifiedFiles.length = 0
}

export function getModifiedFiles(): string[] {
  return modifiedFiles.splice(0)
}

export { setActiveProjectRoot }

function notifyRenderer(event: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(event, data)
    }
  }
}

export async function handleReadFile(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const filePath = String(input.path || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)
  return readFile(absolute, 'utf-8')
}

export async function handleWriteFile(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const filePath = String(input.path || '')
  const content = String(input.content || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)

  await writeFile(absolute, content, 'utf-8')
  modifiedFiles.push(absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: absolute })

  if (isIndexableFile(absolute) && projectRoot) {
    const rel = relative(projectRoot, absolute).replace(/\\/g, '/')
    try {
      await roseLibraryClient.updateFiles([{ path: rel, content }])
    } catch {}
  }

  return `File written: ${filePath}`
}

export async function handleListDirectory(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const dirPath = String(input.path || '.')
  const absolute = dirPath.startsWith('/') || dirPath.includes(':')
    ? dirPath
    : join(projectRoot, dirPath)
  const entries = await readdir(absolute, { withFileTypes: true })
  return JSON.stringify(entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })))
}

export async function handleSearchCode(input: Record<string, unknown>): Promise<string> {
  const query = String(input.query || '')
  const limit = Number(input.limit) || 10
  const results = await roseLibraryClient.search({ query, limit })
  return JSON.stringify(results)
}

export async function handleFindReferences(input: Record<string, unknown>): Promise<string> {
  const symbolName = String(input.symbol_name || '')
  const filePath = input.file_path ? String(input.file_path) : undefined
  const direction = (input.direction as 'inbound' | 'outbound' | 'both') || 'both'
  const results = await roseLibraryClient.findReferences({ symbol_name: symbolName, file_path: filePath, direction })
  return JSON.stringify(results)
}

export async function handleGetProjectOverview(): Promise<string> {
  const overview = await roseLibraryClient.overview()
  const lines: string[] = [
    `## Repository Map (${overview.total_files} files, ${overview.total_symbols} symbols, ${overview.total_references} references)`,
    ''
  ]
  for (const file of overview.files) {
    const deps = file.depends_on.length > 0 ? ` | depends on: ${file.depends_on.join(', ')}` : ''
    const usedBy = file.depended_on_by.length > 0 ? ` | used by: ${file.depended_on_by.join(', ')}` : ''
    lines.push(`### ${file.path} [${file.language}]${deps}${usedBy}`)
    for (const sym of file.symbols) {
      const params = sym.parameters ? `(${sym.parameters})` : ''
      const doc = sym.docstring ? ` — ${sym.docstring}` : ''
      lines.push(`  - ${sym.type} ${sym.qualified_name}${params}${doc}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export async function handleRunCommand(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const command = String(input.command || '')
  const isWindows = platform() === 'win32'
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      shell: isWindows ? 'powershell.exe' : '/bin/bash'
    })
  } catch (err: any) {
    return `Command failed (exit ${err.status || 1}):\n${err.stderr || err.message}`
  }
}

async function executePythonTool(toolName: string, input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const scriptName = toolName.replace(/^tool_/, '')
  const scriptPath = join(projectRoot, 'tools', `${scriptName}.py`)
  const isWindows = platform() === 'win32'
  const python = isWindows ? 'python' : 'python3'
  try {
    return execSync(`"${python}" "${scriptPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      input: JSON.stringify(input),
      timeout: 30000,
      maxBuffer: 1024 * 1024
    })
  } catch (err: any) {
    return `Tool ${scriptName} failed (exit ${err.status || 1}):\n${err.stderr || err.message}`
  }
}

function parsePythonDocstring(source: string): { description: string; parameters: Record<string, { type: string; description: string }> } | null {
  const match = source.match(/^"""([\s\S]*?)"""/)
  if (!match) return null
  const doc = match[1]
  const descMatch = doc.match(/description:\s*(.+)/)
  if (!descMatch) return null
  const description = descMatch[1].trim()
  const parameters: Record<string, { type: string; description: string }> = {}
  const paramSection = doc.match(/parameters:([\s\S]*)/)
  if (paramSection) {
    for (const line of paramSection[1].split('\n')) {
      const m = line.match(/^\s{2}(\w+):\s*(.+)/)
      if (m) parameters[m[1]] = { type: 'string', description: m[2].trim() }
    }
  }
  return { description, parameters }
}

export async function handleListEmails(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const folder = typeof input.folder === 'string' ? input.folder : undefined
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured. Set IMAP credentials in Settings.'
  try {
    const rawMessages = await withImapClient(cfg, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const mbInfo = client.mailbox
        const total = mbInfo ? mbInfo.exists : 0
        if (total === 0) return [] as EmailSummary[]
        const start = Math.max(1, total - 49)
        const messages: EmailSummary[] = []
        for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, uid: true })) {
          messages.push({
            uid: msg.uid,
            subject: msg.envelope?.subject ?? '(no subject)',
            from: msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? '',
            date: msg.envelope?.date?.toISOString() ?? '',
            read: msg.flags?.has('\\Seen') ?? false
          })
        }
        return messages.reverse()
      } finally {
        lock.release()
      }
    })

    const [filters, meta] = await Promise.all([
      readEmailFilters(cfg.imapUser),
      readEmailMeta(cfg.imapUser)
    ])

    const tagged = rawMessages.map(m => {
      const cached = meta[m.uid]
      let msgFolder = cached?.folder ?? 'inbox'
      if (!cached) {
        const isSpam = filters.spamRules.some(r => matchesSpamRule(r, m))
        const isInjection = matchesInjectionPattern(filters.injectionPatterns, `${m.subject} ${m.from}`)
        if (isSpam) msgFolder = 'spam'
        else if (isInjection) msgFolder = 'quarantine'
      }
      return { ...m, folder: msgFolder }
    })

    const filtered = folder ? tagged.filter(m => m.folder === folder) : tagged
    if (filtered.length === 0) return `No emails found${folder ? ` in ${folder}` : ''}.`

    return filtered.map(m =>
      `[UID:${m.uid}] ${m.read ? '' : '(unread) '}From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nFolder: ${m.folder}`
    ).join('\n\n')
  } catch (err) {
    return `Failed to fetch emails: ${(err as Error).message}`
  }
}

export async function handleReadEmail(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const uid = Number(input.uid)
  if (!uid) return 'Missing uid parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured.'
  try {
    const body = await fetchEmailBody(cfg, uid)
    const filters = await readEmailFilters(cfg.imapUser)
    if (matchesInjectionPattern(filters.injectionPatterns, body)) {
      const meta = await readEmailMeta(cfg.imapUser)
      meta[uid] = { ...(meta[uid] ?? { spamClassified: false }), folder: 'quarantine', injectionDetected: true }
      await writeEmailMeta(cfg.imapUser, meta)
      return '[QUARANTINED: Potential prompt injection detected in message body.]'
    }
    return body || '(empty message)'
  } catch (err) {
    return `Failed to read email: ${(err as Error).message}`
  }
}

export async function handleMoveEmailToFolder(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const uid = Number(input.uid)
  const folder = String(input.folder || '')
  if (!uid || !folder) return 'Missing uid or folder parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured.'
  const meta = await readEmailMeta(cfg.imapUser)
  meta[uid] = { ...(meta[uid] ?? { spamClassified: false, injectionDetected: false }), folder }
  await writeEmailMeta(cfg.imapUser, meta)
  return `Email ${uid} moved to ${folder}.`
}

export async function handleDeleteEmail(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const uid = Number(input.uid)
  if (!uid) return 'Missing uid parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured.'
  try {
    await withImapClient(cfg, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        await client.messageDelete(String(uid), { uid: true })
      } finally {
        lock.release()
      }
    })
    const meta = await readEmailMeta(cfg.imapUser)
    delete meta[uid]
    await writeEmailMeta(cfg.imapUser, meta)
    return `Email ${uid} deleted.`
  } catch (err) {
    return `Failed to delete email: ${(err as Error).message}`
  }
}

export async function handleListDiscordChannels(_input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const cfg = await readSettings(projectRoot)
  const enabledIds = new Set(cfg.discordChannels)
  const all = await fetchDiscordChannels()
  const channels = enabledIds.size > 0 ? all.filter((c) => enabledIds.has(c.id)) : all
  if (channels.length === 0) return 'No Discord channels are enabled. Configure them in Settings > Discord.'
  const byGuild = channels.reduce<Record<string, typeof channels>>((acc, ch) => {
    (acc[ch.guildName] ??= []).push(ch)
    return acc
  }, {})
  return Object.entries(byGuild).map(([guild, chs]) =>
    `Server: ${guild}\n${chs.map(c => `  #${c.name} (ID: ${c.id})`).join('\n')}`
  ).join('\n\n')
}

export async function handleReadDiscordMessages(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const channelId = String(input.channelId || '')
  const limit = Math.min(Number(input.limit) || 20, 100)
  if (!channelId) return 'Missing channelId parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.discordBotToken) return 'Discord not configured. Set a bot token in Settings.'
  const messages = await fetchDiscordMessages(channelId, limit)
  if (messages.length === 0) return 'No messages found in that channel.'
  return messages.map(m => {
    const ts = new Date(m.timestamp).toLocaleString()
    let line = `[${ts}] @${m.authorUsername}: ${m.content}`
    if (m.attachments.length > 0) line += ` [${m.attachments.map(a => a.filename).join(', ')}]`
    if (m.embeds.length > 0) line += ` [embed: ${m.embeds.map(e => e.title || 'untitled').join(', ')}]`
    return line
  }).join('\n')
}

export async function handleSendDiscordMessage(input: Record<string, unknown>): Promise<string> {
  const channelId = String(input.channelId || '')
  const content = String(input.content || '')
  if (!channelId || !content) return 'Missing channelId or content parameter.'
  await sendDiscordMessage(channelId, content)
  return `Message sent to channel ${channelId}.`
}

export interface PythonToolMeta {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string }>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}

export async function discoverPythonTools(rootPath: string): Promise<PythonToolMeta[]> {
  const toolsDir = join(rootPath, 'tools')
  let files: string[] = []
  try {
    files = (await readdir(toolsDir)).filter((f) => f.endsWith('.py'))
  } catch {
    return []
  }
  const tools: PythonToolMeta[] = []
  for (const file of files) {
    try {
      const source = await readFile(join(toolsDir, file), 'utf-8')
      const meta = parsePythonDocstring(source)
      if (!meta) continue
      const scriptName = basename(file, '.py')
      const toolName = `tool_${scriptName}`
      tools.push({
        name: toolName,
        description: meta.description,
        parameters: meta.parameters,
        execute: (input, root) => executePythonTool(toolName, input, root)
      })
    } catch {
      // skip unreadable scripts
    }
  }
  return tools
}
