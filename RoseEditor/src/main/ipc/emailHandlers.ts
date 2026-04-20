import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { generateText } from 'ai'
import { IPC } from '../../shared/ipcChannels'
import { readSettings, AppSettings } from './settingsHandlers'
import { resolveModel } from '../services/llmClient'

export interface EmailSummary {
  uid: number
  subject: string
  from: string
  date: string
  read: boolean
}

interface SpamRule {
  id: string
  type: 'sender' | 'domain' | 'subject'
  value: string
  enabled: boolean
}

interface InjectionPattern {
  id: string
  pattern: string
  isRegex: boolean
  enabled: boolean
  builtin: boolean
}

interface EmailFilters {
  spamRules: SpamRule[]
  injectionPatterns: InjectionPattern[]
  customFolders: Array<{ id: string; name: string }>
}

interface EmailMessageMeta {
  folder: string
  spamClassified: boolean
  injectionDetected: boolean
}

const DEFAULT_INJECTION_PATTERNS: InjectionPattern[] = [
  { id: 'bi-1', pattern: 'ignore previous instructions', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-2', pattern: 'disregard all previous', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-3', pattern: 'you are now', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-4', pattern: 'SYSTEM:', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-5', pattern: 'forget your instructions', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-6', pattern: 'act as if', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-7', pattern: 'DAN mode', isRegex: false, enabled: true, builtin: true },
]

type ImapCfg = Pick<AppSettings, 'imapHost' | 'imapPort' | 'imapUser' | 'imapPassword' | 'imapTLS'>

function makeClient(cfg: ImapCfg): ImapFlow {
  return new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapTLS,
    auth: { user: cfg.imapUser, pass: cfg.imapPassword },
    logger: false
  })
}

async function withClient<T>(cfg: ImapCfg, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = makeClient(cfg)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

function describeImapError(err: unknown, cfg: ImapCfg): string {
  if (!(err instanceof Error)) return String(err)

  const e = err as Error & {
    code?: string
    hostname?: string
    responseText?: string
    serverResponseCode?: string
    authenticationFailed?: boolean
  }

  if (e.code === 'ENOTFOUND') {
    return `Host not found: "${e.hostname ?? cfg.imapHost}" — check your IMAP server address`
  }
  if (e.code === 'ECONNREFUSED') {
    return `Connection refused on port ${cfg.imapPort} — check the port number and that the server is reachable`
  }
  if (e.code === 'ETIMEDOUT' || e.code === 'ESOCKETTIMEDOUT') {
    return `Connection timed out — server is unreachable or port ${cfg.imapPort} is blocked by a firewall`
  }
  if (e.code === 'ECONNRESET') {
    return `Connection was reset by the server — try enabling TLS or switching ports`
  }
  if (e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'CERT_HAS_EXPIRED') {
    return `TLS certificate error (${e.code}) — try disabling TLS or use port 143`
  }
  if (e.authenticationFailed) {
    const detail = e.responseText ? ` — server said: ${e.responseText}` : ''
    return `Authentication failed${detail}`
  }

  const parts: string[] = [e.message]
  if (e.responseText && e.responseText !== e.message) parts.push(e.responseText)
  return parts.join(' — ')
}

function accountKey(imapUser: string): string {
  return imapUser.replace(/[^a-zA-Z0-9@._-]/g, '_')
}

async function readFilters(imapUser: string): Promise<EmailFilters> {
  const p = join(app.getPath('userData'), `email-filters-${accountKey(imapUser)}.json`)
  try {
    const stored = JSON.parse(await readFile(p, 'utf-8')) as Partial<EmailFilters>
    // Merge stored injection patterns with built-ins (keep built-in enabled state from stored if present)
    const storedBuiltins = new Map((stored.injectionPatterns ?? []).filter(ip => ip.builtin).map(ip => [ip.id, ip]))
    const mergedBuiltins = DEFAULT_INJECTION_PATTERNS.map(bp => storedBuiltins.get(bp.id) ?? bp)
    const userPatterns = (stored.injectionPatterns ?? []).filter(ip => !ip.builtin)
    return {
      spamRules: stored.spamRules ?? [],
      injectionPatterns: [...mergedBuiltins, ...userPatterns],
      customFolders: stored.customFolders ?? []
    }
  } catch {
    return { spamRules: [], injectionPatterns: [...DEFAULT_INJECTION_PATTERNS], customFolders: [] }
  }
}

async function writeFilters(imapUser: string, filters: EmailFilters): Promise<void> {
  const p = join(app.getPath('userData'), `email-filters-${accountKey(imapUser)}.json`)
  await writeFile(p, JSON.stringify(filters, null, 2))
}

async function readMeta(imapUser: string): Promise<Record<string, EmailMessageMeta>> {
  const p = join(app.getPath('userData'), `email-meta-${accountKey(imapUser)}.json`)
  try { return JSON.parse(await readFile(p, 'utf-8')) as Record<string, EmailMessageMeta> }
  catch { return {} }
}

async function writeMeta(imapUser: string, meta: Record<string, EmailMessageMeta>): Promise<void> {
  const p = join(app.getPath('userData'), `email-meta-${accountKey(imapUser)}.json`)
  await writeFile(p, JSON.stringify(meta, null, 2))
}

function matchesSpamRule(rule: SpamRule, msg: EmailSummary): boolean {
  if (!rule.enabled) return false
  const v = rule.value.toLowerCase()
  switch (rule.type) {
    case 'sender': return msg.from.toLowerCase().includes(v)
    case 'domain': return msg.from.toLowerCase().includes('@' + v)
    case 'subject': return msg.subject.toLowerCase().includes(v)
  }
}

function matchesInjection(patterns: InjectionPattern[], text: string): boolean {
  return patterns.some(p => {
    if (!p.enabled) return false
    try {
      if (p.isRegex) return new RegExp(p.pattern, 'i').test(text)
    } catch { return false }
    return text.toLowerCase().includes(p.pattern.toLowerCase())
  })
}

function removeLinks(text: string): string {
  return text
    .replace(/https?:\/\/[^\s\])"'>]+/g, '')
    .replace(/www\.[^\s\])"'>]+/g, '')
    .replace(/[ \t]*\n[ \t]*\n[ \t]*\n/g, '\n\n')
    .trim()
}

async function classifySpamBatch(messages: EmailSummary[]): Promise<Record<number, boolean>> {
  if (messages.length === 0) return {}
  try {
    const settings = await readSettings()
    const defaultModel = settings.models.find(m => m.id === settings.defaultModelId) ?? settings.models[0]
    if (!defaultModel) return {}
    const model = resolveModel(defaultModel, settings.providerKeys)
    const lines = messages.map((m, i) => `${i + 1}. From: ${m.from} | Subject: ${m.subject}`).join('\n')
    const { text } = await generateText({
      model,
      messages: [{
        role: 'user' as const,
        content: `Classify each email as spam (1) or not spam (0). Reply with ONLY a JSON array of 0s and 1s in the same order, no other text:\n\n${lines}`
      }]
    })
    const arr = JSON.parse(text.trim()) as number[]
    const result: Record<number, boolean> = {}
    messages.forEach((m, i) => { result[m.uid] = arr[i] === 1 })
    return result
  } catch {
    return {}
  }
}

export function registerEmailHandlers(): void {
  ipcMain.handle(IPC.EMAIL_TEST_CONN, async (): Promise<{ ok: boolean; error?: string }> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) {
      return { ok: false, error: 'IMAP host and user are required' }
    }
    try {
      await withClient(cfg, async () => {})
      return { ok: true }
    } catch (err) {
      return { ok: false, error: describeImapError(err, cfg) }
    }
  })

  ipcMain.handle(IPC.EMAIL_FETCH_MESSAGES, async (): Promise<Array<EmailSummary & { folder: string; injectionDetected: boolean }>> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return []
    try {
      const rawMessages = await withClient(cfg, async (client) => {
        const lock = await client.getMailboxLock('INBOX')
        try {
          const mbInfo = client.mailbox
          const total = mbInfo ? mbInfo.exists : 0
          if (total === 0) return []
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

      const filters = await readFilters(cfg.imapUser)
      const meta = await readMeta(cfg.imapUser)

      const unclassified: EmailSummary[] = []
      for (const msg of rawMessages) {
        if (meta[msg.uid]) continue
        const isSpam = filters.spamRules.some(r => matchesSpamRule(r, msg))
        const isInjection = matchesInjection(filters.injectionPatterns, `${msg.subject} ${msg.from}`)
        if (isSpam) {
          meta[msg.uid] = { folder: 'spam', spamClassified: true, injectionDetected: false }
        } else if (isInjection) {
          meta[msg.uid] = { folder: 'quarantine', spamClassified: false, injectionDetected: true }
        } else {
          unclassified.push(msg)
        }
      }

      if (unclassified.length > 0) {
        const spamResults = await classifySpamBatch(unclassified)
        for (const msg of unclassified) {
          const isSpam = spamResults[msg.uid] ?? false
          meta[msg.uid] = { folder: isSpam ? 'spam' : 'inbox', spamClassified: true, injectionDetected: false }
        }
      }

      await writeMeta(cfg.imapUser, meta)

      return rawMessages.map(m => ({
        ...m,
        folder: meta[m.uid]?.folder ?? 'inbox',
        injectionDetected: meta[m.uid]?.injectionDetected ?? false
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.EMAIL_FETCH_MESSAGE, async (_event, uid: number): Promise<string> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return ''
    try {
      const raw = await withClient(cfg, async (client) => {
        const lock = await client.getMailboxLock('INBOX')
        try {
          const { content } = await client.download(String(uid), undefined, { uid: true })
          const parsed = await simpleParser(content)
          return parsed.text ?? ''
        } finally {
          lock.release()
        }
      })

      const body = removeLinks(raw)

      const filters = await readFilters(cfg.imapUser)
      if (matchesInjection(filters.injectionPatterns, body)) {
        const meta = await readMeta(cfg.imapUser)
        meta[uid] = { ...(meta[uid] ?? { spamClassified: false }), folder: 'quarantine', injectionDetected: true }
        await writeMeta(cfg.imapUser, meta)
        return '[QUARANTINED: Potential prompt injection detected in message body. This message has been moved to Quarantine.]'
      }

      return body
    } catch {
      return ''
    }
  })

  ipcMain.handle(IPC.EMAIL_DELETE_MESSAGE, async (_event, uid: number): Promise<{ ok: boolean; error?: string }> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return { ok: false, error: 'Not configured' }
    try {
      await withClient(cfg, async (client) => {
        const lock = await client.getMailboxLock('INBOX')
        try {
          await client.messageDelete(String(uid), { uid: true })
        } finally {
          lock.release()
        }
      })
      // Clean up metadata for deleted message
      const meta = await readMeta(cfg.imapUser)
      delete meta[uid]
      await writeMeta(cfg.imapUser, meta)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.EMAIL_GET_FILTERS, async (): Promise<EmailFilters> => {
    const cfg = await readSettings()
    return readFilters(cfg.imapUser)
  })

  ipcMain.handle(IPC.EMAIL_SET_FILTERS, async (_event, patch: Partial<EmailFilters>): Promise<EmailFilters> => {
    const cfg = await readSettings()
    const current = await readFilters(cfg.imapUser)
    const updated: EmailFilters = { ...current, ...patch }
    await writeFilters(cfg.imapUser, updated)
    return updated
  })

  ipcMain.handle(IPC.EMAIL_GET_META, async (): Promise<Record<string, EmailMessageMeta>> => {
    const cfg = await readSettings()
    return readMeta(cfg.imapUser)
  })

  ipcMain.handle(IPC.EMAIL_SET_MSG_FOLDER, async (_event, uid: number, folder: string): Promise<void> => {
    const cfg = await readSettings()
    const meta = await readMeta(cfg.imapUser)
    meta[uid] = { ...(meta[uid] ?? { spamClassified: false, injectionDetected: false }), folder }
    await writeMeta(cfg.imapUser, meta)
  })
}
