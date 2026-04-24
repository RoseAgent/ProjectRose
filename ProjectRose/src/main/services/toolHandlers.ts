import { readFile, writeFile, readdir, mkdir, stat } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { createHash } from 'crypto'
import { prPath } from '../lib/projectPaths'
import { execSync } from 'child_process'
import { platform } from 'os'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { lspRequest } from './lspManager'

const modifiedFiles: string[] = []
let _activeProjectRoot: string | null = null

const validFileTokens = new Map<string, string>() // absolutePath → token

function computeToken(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

export function resetModifiedFiles(): void {
  modifiedFiles.length = 0
}

export function getModifiedFiles(): string[] {
  return modifiedFiles.splice(0)
}

export function setActiveProjectRoot(rootPath: string): void {
  _activeProjectRoot = rootPath
}

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

  if (basename(absolute) === '.env' || basename(absolute).startsWith('.env.')) {
    return 'Access denied: .env files cannot be read.'
  }

  let content: string
  let tokenBase: string
  try {
    content = await readFile(absolute, 'utf-8')
    tokenBase = content
  } catch {
    content = 'File does not exist.'
    tokenBase = absolute + ':new'
  }

  const token = computeToken(tokenBase)
  validFileTokens.set(absolute, token)
  return `${content}\n[file_token: ${token}]`
}

export async function handleWriteFile(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const providedToken = String(input.file_token || '')
  if (!providedToken) {
    return 'Missing file_token. Call the read_file tool on this file first to get a token before writing.'
  }

  const filePath = String(input.path || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)

  const expectedToken = validFileTokens.get(absolute)
  if (!expectedToken || expectedToken !== providedToken) {
    return `Invalid or expired file_token for ${filePath}. Call read_file on this specific file to get a valid token.`
  }

  const content = String(input.content || '')
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, 'utf-8')
  modifiedFiles.push(absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: absolute })

  const newToken = computeToken(content + Date.now())
  validFileTokens.set(absolute, newToken)

  return `File written: ${filePath}\n[file_token: ${newToken}]`
}

export async function handleEditFile(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const providedToken = String(input.file_token || '')
  if (!providedToken) {
    return 'Missing file_token. Call the read_file tool on this file first to get a token before editing.'
  }

  const filePath = String(input.path || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)

  const expectedToken = validFileTokens.get(absolute)
  if (!expectedToken || expectedToken !== providedToken) {
    return `Invalid or expired file_token for ${filePath}. Call read_file on this specific file to get a valid token.`
  }

  const oldString = String(input.old_string ?? '')
  const newString = String(input.new_string ?? '')

  const content = await readFile(absolute, 'utf-8')
  const occurrences = content.split(oldString).length - 1
  if (occurrences === 0) {
    return `old_string not found in ${filePath}. Read the file again to get current content before editing.`
  }
  if (occurrences > 1) {
    return `old_string matches ${occurrences} locations in ${filePath}. Provide more surrounding context to make it unique.`
  }

  const updated = content.replace(oldString, newString)
  await writeFile(absolute, updated, 'utf-8')
  modifiedFiles.push(absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: absolute })

  const newToken = computeToken(updated + Date.now())
  validFileTokens.set(absolute, newToken)

  return `File edited: ${filePath}\n[file_token: ${newToken}]`
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

  // Try TypeScript server first (most projects are TS), then Python
  for (const server of ['ts', 'py'] as const) {
    try {
      const results = await lspRequest(server, 'workspace/symbol', { query }) as any[]
      if (!Array.isArray(results) || results.length === 0) continue
      const formatted = results.slice(0, limit).map((s: any) => ({
        name: s.name,
        kind: s.kind,
        location: s.location,
        containerName: s.containerName
      }))
      return JSON.stringify(formatted)
    } catch { /* try next server */ }
  }

  return JSON.stringify({ message: 'No language server available or no results found for: ' + query })
}

export async function handleFindReferences(input: Record<string, unknown>): Promise<string> {
  const symbolName = String(input.symbol_name || '')

  // Find the symbol location via workspace/symbol
  for (const server of ['ts', 'py'] as const) {
    try {
      const symbols = await lspRequest(server, 'workspace/symbol', { query: symbolName }) as any[]
      if (!Array.isArray(symbols) || symbols.length === 0) continue

      const target = symbols.find((s: any) => s.name === symbolName) ?? symbols[0]
      const loc = target.location
      if (!loc?.uri || !loc?.range) continue

      const refs = await lspRequest(server, 'textDocument/references', {
        textDocument: { uri: loc.uri },
        position: loc.range.start,
        context: { includeDeclaration: true }
      }) as any[]

      return JSON.stringify(Array.isArray(refs) ? refs : [])
    } catch { /* try next server */ }
  }

  return JSON.stringify({ message: 'No language server available or symbol not found: ' + symbolName })
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

export interface PythonToolMeta {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string }>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}

// ── Grep handler ──

const GREP_IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '__pycache__', '.cache'])

async function grepWalk(
  dir: string,
  regex: RegExp,
  includeExts: string[],
  projectRoot: string,
  results: Array<{ rel: string; line: number; text: string }>,
  max: number
): Promise<void> {
  if (results.length >= max) return
  let entries: string[]
  try { entries = await readdir(dir) } catch { return }

  for (const entry of entries) {
    if (results.length >= max) break
    if (GREP_IGNORED.has(entry)) continue
    const full = join(dir, entry)
    let s
    try { s = await stat(full) } catch { continue }

    if (s.isDirectory()) {
      await grepWalk(full, regex, includeExts, projectRoot, results, max)
    } else if (s.isFile()) {
      if (includeExts.length > 0 && !includeExts.some((ext) => entry.endsWith(ext))) continue
      let content: string
      try { content = await readFile(full, 'utf-8') } catch { continue }
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < max; i++) {
        if (regex.test(lines[i])) {
          const rel = full.startsWith(projectRoot) ? full.slice(projectRoot.length).replace(/^[\\/]/, '') : full
          results.push({ rel, line: i + 1, text: lines[i].trim() })
        }
      }
    }
  }
}

export async function handleGrep(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const pattern = String(input.pattern || '')
  if (!pattern) return 'No pattern provided.'

  let regex: RegExp
  try {
    regex = new RegExp(pattern, input.case_sensitive ? '' : 'i')
  } catch {
    return `Invalid regex: ${pattern}`
  }

  const searchPath = String(input.path || '.')
  const absolute = searchPath.startsWith('/') || searchPath.includes(':')
    ? searchPath
    : join(projectRoot, searchPath)

  const includeExts = String(input.include || '')
    .split(',').map((s) => s.trim().replace(/^\*/, '')).filter(Boolean)

  const results: Array<{ rel: string; line: number; text: string }> = []
  await grepWalk(absolute, regex, includeExts, projectRoot, results, 200)

  if (results.length === 0) return `No matches for: ${pattern}`
  const lines = results.map((r) => `${r.rel}:${r.line}: ${r.text}`)
  return results.length === 200
    ? lines.join('\n') + '\n[truncated at 200 matches]'
    : lines.join('\n')
}

export async function discoverPythonTools(rootPath: string): Promise<PythonToolMeta[]> {
  const toolsDir = prPath(rootPath, 'tools')
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
