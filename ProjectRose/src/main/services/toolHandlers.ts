import { readFile, writeFile, readdir, mkdir, stat, unlink, rename } from 'fs/promises'
import { join, relative, normalize } from 'path'
import { exec, spawn } from 'child_process'
import { platform } from 'os'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { sessionRegistry } from './sessionRegistry'
import { resolveProjectPath } from './projectPathGuard'
import { getConversationToolState } from './conversationToolState'
import {
  spawnBackgroundProcess,
  readBackgroundProcessOutput,
  killBackgroundProcess,
  listBackgroundProcesses
} from './backgroundProcesses'
import { readSettings } from './settingsService'
import { readSearchApiKey } from './search/searchCredentialsStore'
import type { ExtensionToolCtx } from '../../shared/extension-types'
import { withAugmentedPath } from '../lib/childProcessEnv'

function notifyRenderer(event: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(event, data)
    }
  }
}

// Push a modified file path onto the owning ChatSession's per-turn list.
// Looked up via the registry rather than passed explicitly so the handler
// signature stays compatible with the rest of the tool family.
function recordModifiedFile(toolCtx: ExtensionToolCtx | undefined, absolute: string): void {
  if (!toolCtx) return
  sessionRegistry.get(toolCtx.sessionId)?.modifiedFiles.push(absolute)
}

// Key used by the read-before-modify guard. Windows paths are compared
// case-insensitively because the filesystem is.
function readGuardKey(absolute: string): string {
  const normalized = normalize(absolute)
  return platform() === 'win32' ? normalized.toLowerCase() : normalized
}

function markFileRead(toolCtx: ExtensionToolCtx | undefined, absolute: string): void {
  if (!toolCtx?.sessionId) return
  getConversationToolState(toolCtx.sessionId).readFiles.add(readGuardKey(absolute))
}

function wasFileRead(toolCtx: ExtensionToolCtx | undefined, absolute: string): boolean {
  if (!toolCtx?.sessionId) return true // no session (tests, detached callers) — no guard
  return getConversationToolState(toolCtx.sessionId).readFiles.has(readGuardKey(absolute))
}

// ── read_file ──

const READ_DEFAULT_LIMIT = 2000
const READ_MAX_LINE_CHARS = 2000
const READ_MAX_BYTES = 20 * 1024 * 1024

export async function handleReadFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const filePath = String(input.path || '')
  const resolved = resolveProjectPath(filePath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in resolved) return resolved.deniedReason

  let fileStat
  try {
    fileStat = await stat(resolved.absolute)
  } catch {
    return `Error: file does not exist: ${filePath}`
  }
  if (fileStat.isDirectory()) return `Error: ${filePath} is a directory. Use list_directory.`
  if (fileStat.size > READ_MAX_BYTES) {
    return `Error: file is ${fileStat.size} bytes — too large to read. Use grep to search inside it.`
  }

  const content = await readFile(resolved.absolute, 'utf-8')
  if (content.includes('\0')) {
    return `Error: ${filePath} appears to be a binary file.`
  }

  markFileRead(toolCtx, resolved.absolute)

  if (content.length === 0) return '[File is empty]'

  const lines = content.split('\n')
  const totalLines = lines.length
  const offset = Math.max(1, Math.floor(Number(input.offset) || 1))
  const limit = Math.max(1, Math.floor(Number(input.limit) || READ_DEFAULT_LIMIT))
  if (offset > totalLines) {
    return `Error: offset ${offset} is past the end of the file (${totalLines} lines).`
  }
  const slice = lines.slice(offset - 1, offset - 1 + limit)

  const numbered = slice
    .map((line, i) => {
      const text = line.length > READ_MAX_LINE_CHARS ? line.slice(0, READ_MAX_LINE_CHARS) + '…' : line
      return `${offset + i}\t${text}`
    })
    .join('\n')

  const lastShown = offset - 1 + slice.length
  if (offset > 1 || lastShown < totalLines) {
    return `${numbered}\n[Showing lines ${offset}–${lastShown} of ${totalLines}. Use offset/limit to read more.]`
  }
  return numbered
}

// ── write_file ──

export async function handleWriteFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const filePath = String(input.path || '')
  const resolved = resolveProjectPath(filePath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in resolved) return resolved.deniedReason

  // Overwriting an existing file the Agent has never read is the classic
  // blind-clobber failure mode; require a prior read_file this Conversation.
  // Brand-new files are unrestricted.
  const exists = await stat(resolved.absolute).then((s) => s.isFile(), () => false)
  if (exists && !wasFileRead(toolCtx, resolved.absolute)) {
    return `Error: ${filePath} already exists but has not been read this conversation. Read it with read_file before overwriting.`
  }

  const content = String(input.content ?? '')
  await mkdir(join(resolved.absolute, '..'), { recursive: true })
  await writeFile(resolved.absolute, content, 'utf-8')
  markFileRead(toolCtx, resolved.absolute)
  recordModifiedFile(toolCtx, resolved.absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: resolved.absolute })

  return `File written: ${filePath}`
}

// ── edit_file ──

export async function handleEditFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const filePath = String(input.path || '')
  const resolved = resolveProjectPath(filePath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in resolved) return resolved.deniedReason

  const oldString = String(input.old_string ?? '')
  const newString = String(input.new_string ?? '')
  const replaceAll = input.replace_all === true
  if (!oldString) return 'Error: old_string must not be empty.'

  let content: string
  try {
    content = await readFile(resolved.absolute, 'utf-8')
  } catch {
    return `Error: file does not exist: ${filePath}`
  }

  if (!wasFileRead(toolCtx, resolved.absolute)) {
    return `Error: ${filePath} has not been read this conversation. Read it with read_file before editing.`
  }

  const occurrences = content.split(oldString).length - 1
  if (occurrences === 0) {
    return `old_string not found in ${filePath}. Read the file again to get current content before editing.`
  }
  if (occurrences > 1 && !replaceAll) {
    return `old_string matches ${occurrences} locations in ${filePath}. Provide more surrounding context to make it unique, or pass replace_all: true to replace every occurrence.`
  }

  const updated = replaceAll
    ? content.split(oldString).join(newString)
    : content.replace(oldString, newString)
  await writeFile(resolved.absolute, updated, 'utf-8')
  recordModifiedFile(toolCtx, resolved.absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: resolved.absolute })

  return replaceAll && occurrences > 1
    ? `File edited: ${filePath} (${occurrences} replacements)`
    : `File edited: ${filePath}`
}

// ── list_directory ──

export async function handleListDirectory(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const dirPath = String(input.path || '.')
  const resolved = resolveProjectPath(dirPath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in resolved) return resolved.deniedReason
  const entries = await readdir(resolved.absolute, { withFileTypes: true })
  return JSON.stringify(entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })))
}

// ── delete_file / move_file ──

export async function handleDeleteFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const filePath = String(input.path || '')
  const resolved = resolveProjectPath(filePath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in resolved) return resolved.deniedReason

  let fileStat
  try {
    fileStat = await stat(resolved.absolute)
  } catch {
    return `Error: file does not exist: ${filePath}`
  }
  if (fileStat.isDirectory()) {
    return `Error: ${filePath} is a directory. delete_file only deletes files; use run_command to remove directories.`
  }

  await unlink(resolved.absolute)
  recordModifiedFile(toolCtx, resolved.absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: resolved.absolute })
  return `File deleted: ${filePath}`
}

export async function handleMoveFile(
  input: Record<string, unknown>,
  projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const fromPath = String(input.path || '')
  const toPath = String(input.new_path || '')
  const from = resolveProjectPath(fromPath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in from) return from.deniedReason
  const to = resolveProjectPath(toPath, projectRoot, { blockDotEnv: true })
  if ('deniedReason' in to) return to.deniedReason

  const sourceExists = await stat(from.absolute).then(() => true, () => false)
  if (!sourceExists) return `Error: file does not exist: ${fromPath}`
  const destExists = await stat(to.absolute).then(() => true, () => false)
  if (destExists) return `Error: destination already exists: ${toPath}`

  await mkdir(join(to.absolute, '..'), { recursive: true })
  await rename(from.absolute, to.absolute)
  // A previously-read source stays "read" at its new location.
  if (toolCtx?.sessionId && wasFileRead(toolCtx, from.absolute)) {
    markFileRead(toolCtx, to.absolute)
  }
  recordModifiedFile(toolCtx, from.absolute)
  recordModifiedFile(toolCtx, to.absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: from.absolute })
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: to.absolute })
  return `Moved: ${fromPath} → ${toPath}`
}

// ── run_command + background processes ──

const RUN_DEFAULT_TIMEOUT_MS = 120_000
const RUN_MAX_TIMEOUT_MS = 600_000
const RUN_OUTPUT_CAP = 30_000

function shellForPlatform(): string {
  return platform() === 'win32' ? 'powershell.exe' : '/bin/bash'
}

function capOutput(text: string): string {
  if (text.length <= RUN_OUTPUT_CAP) return text
  return text.slice(0, RUN_OUTPUT_CAP) + `\n[output truncated — ${text.length} chars total]`
}

export async function handleRunCommand(
  input: Record<string, unknown>,
  projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const command = String(input.command || '')
  if (!command) return 'Error: no command provided.'

  if (input.run_in_background === true) {
    if (!toolCtx?.sessionId) return 'Error: background processes require an active conversation.'
    const shellId = spawnBackgroundProcess(toolCtx.sessionId, command, projectRoot)
    return `Started background process ${shellId}. Use read_process_output to poll it and kill_process to stop it.`
  }

  const rawTimeout = Number(input.timeout)
  const timeout = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? Math.min(rawTimeout, RUN_MAX_TIMEOUT_MS)
    : RUN_DEFAULT_TIMEOUT_MS

  return new Promise<string>((resolvePromise) => {
    exec(
      command,
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout,
        killSignal: 'SIGTERM',
        maxBuffer: 10 * 1024 * 1024,
        shell: shellForPlatform(),
        env: withAugmentedPath()
      },
      (err, stdout, stderr) => {
        const parts: string[] = []
        if (stdout) parts.push(stdout)
        if (stderr) parts.push(`[stderr]\n${stderr}`)
        if (err) {
          const timedOut = err.killed || /ETIMEDOUT/.test(err.message)
          const header = timedOut
            ? `Command timed out after ${timeout} ms. For long-running commands pass a larger timeout, or run_in_background for servers/watchers.`
            : `Command failed (exit ${err.code ?? 1}):`
          resolvePromise(capOutput([header, ...parts].join('\n')))
          return
        }
        resolvePromise(capOutput(parts.join('\n') || '(no output)'))
      }
    )
  })
}

export async function handleReadProcessOutput(
  input: Record<string, unknown>,
  _projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const shellId = String(input.shell_id || '')
  if (!toolCtx?.sessionId) return 'Error: no active conversation.'
  const read = readBackgroundProcessOutput(toolCtx.sessionId, shellId)
  if (!read.found) {
    const known = listBackgroundProcesses(toolCtx.sessionId)
    return `Error: no background process ${shellId}. Known: ${known.length ? known.map((p) => `${p.shellId} (${p.running ? 'running' : 'exited'})`).join(', ') : 'none'}`
  }
  const status = read.running ? 'running' : `exited (code ${read.exitCode})`
  const body = read.output || '(no new output)'
  return `[${shellId}: ${status}]\n${capOutput(body)}`
}

export async function handleKillProcess(
  input: Record<string, unknown>,
  _projectRoot: string,
  toolCtx?: ExtensionToolCtx
): Promise<string> {
  const shellId = String(input.shell_id || '')
  if (!toolCtx?.sessionId) return 'Error: no active conversation.'
  const result = killBackgroundProcess(toolCtx.sessionId, shellId)
  if (!result.found) return `Error: no background process ${shellId}.`
  return result.wasRunning ? `Killed ${shellId}.` : `${shellId} had already exited; removed.`
}

// ── ripgrep-backed grep + glob ──

// @vscode/ripgrep 1.18+ is ESM-only, which the CJS main bundle cannot
// `require()`. Its wrapper does nothing but resolve the per-platform binary
// package, so replicate that resolution here directly — the platform packages
// (@vscode/ripgrep-<platform>-<arch>) contain only the binary, no JS to load.
// In the packaged app the binary must live outside the asar archive (see
// asarUnpack in package.json / electron-builder.ci.yml).
function resolveRgBinary(): string {
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const platformPkg = `@vscode/ripgrep-${process.platform}-${process.arch}`
  try {
    return require.resolve(`${platformPkg}/bin/${binaryName}`).replace(/\bapp\.asar\b/, 'app.asar.unpacked')
  } catch {
    return '' // surfaced as a spawn error ("grep failed") if ever hit
  }
}
const rgBinary = resolveRgBinary()

function runRipgrep(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const proc = spawn(rgBinary, args, { cwd })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    proc.on('error', (err) => resolvePromise({ code: 2, stdout: '', stderr: err.message }))
    proc.on('close', (code) => resolvePromise({ code: code ?? 2, stdout, stderr }))
  })
}

// `.env` files never appear in search results — same blast radius as
// read_file's denial.
const RG_DOTENV_EXCLUDES = ['-g', '!.env', '-g', '!.env.*']

const GREP_MAX_LINES = 250

function includeToGlobs(include: string): string[] {
  return include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((token) => {
      const glob = token.startsWith('.') ? `*${token}` : token
      return ['-g', glob]
    })
}

export async function handleGrep(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const pattern = String(input.pattern || '')
  if (!pattern) return 'No pattern provided.'

  const searchPath = String(input.path || '.')
  const resolved = resolveProjectPath(searchPath, projectRoot)
  const absolute = 'absolute' in resolved ? resolved.absolute : join(projectRoot, searchPath)
  const rel = relative(projectRoot, absolute) || '.'

  const args = ['--line-number', '--no-heading', '--color', 'never', '--max-columns', '400', '--max-columns-preview', ...RG_DOTENV_EXCLUDES]
  if (input.case_sensitive !== true) args.push('-i')
  const context = Number(input.context)
  if (Number.isFinite(context) && context > 0) args.push('-C', String(Math.min(10, Math.floor(context))))
  if (typeof input.include === 'string' && input.include) args.push(...includeToGlobs(input.include))
  args.push('--', pattern, rel.startsWith('..') ? absolute : rel)

  const { code, stdout, stderr } = await runRipgrep(args, projectRoot)
  if (code === 1) return `No matches for: ${pattern}`
  if (code !== 0) return `grep failed: ${stderr.trim() || `ripgrep exit ${code}`}`

  const lines = stdout.replace(/\r\n/g, '\n').trimEnd().split('\n')
  if (lines.length > GREP_MAX_LINES) {
    return lines.slice(0, GREP_MAX_LINES).join('\n') + `\n[truncated at ${GREP_MAX_LINES} of ${lines.length} lines — narrow with path or include]`
  }
  return lines.join('\n')
}

const GLOB_MAX_FILES = 300

export async function handleGlob(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const pattern = String(input.pattern || '')
  if (!pattern) return 'No pattern provided.'

  const searchPath = String(input.path || '.')
  const resolved = resolveProjectPath(searchPath, projectRoot)
  const absolute = 'absolute' in resolved ? resolved.absolute : join(projectRoot, searchPath)
  const rel = relative(projectRoot, absolute) || '.'

  const args = ['--files', '-g', pattern, ...RG_DOTENV_EXCLUDES, rel.startsWith('..') ? absolute : rel]
  const { code, stdout, stderr } = await runRipgrep(args, projectRoot)
  if (code === 1 || (code === 0 && !stdout.trim())) return `No files match: ${pattern}`
  if (code !== 0) return `glob failed: ${stderr.trim() || `ripgrep exit ${code}`}`

  const files = stdout.replace(/\r\n/g, '\n').trimEnd().split('\n')
  const capped = files.slice(0, GLOB_MAX_FILES)

  // Most-recently-modified first — the file the user is working on tends to
  // be the one the Agent wants.
  const withMtime = await Promise.all(
    capped.map(async (file) => {
      const mtime = await stat(join(projectRoot, file)).then((s) => s.mtimeMs, () => 0)
      return { file, mtime }
    })
  )
  withMtime.sort((a, b) => b.mtime - a.mtime)
  const body = withMtime.map((f) => f.file).join('\n')
  return files.length > GLOB_MAX_FILES
    ? body + `\n[truncated at ${GLOB_MAX_FILES} of ${files.length} files]`
    : body
}

// ── fetch_url ──

const FETCH_TIMEOUT_MS = 20_000
const FETCH_MAX_CHARS = 40_000

function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim()
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|blockquote|pre|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
  text = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return title ? `# ${title}\n\n${text}` : text
}

export async function handleFetchUrl(input: Record<string, unknown>): Promise<string> {
  const rawUrl = String(input.url || '')
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return `Error: invalid URL: ${rawUrl}`
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `Error: only http/https URLs are supported.`
  }

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'ProjectRose/2.0 (agent fetch_url)' }
    })
  } catch (err) {
    return `Error: fetch failed: ${err instanceof Error ? err.message : String(err)}`
  }
  if (!res.ok) return `Error: HTTP ${res.status} fetching ${rawUrl}`

  const contentType = res.headers.get('content-type') ?? ''
  const raw = (await res.text()).slice(0, 500_000)
  const text = /html/i.test(contentType) || /^\s*(?:<!doctype|<html)/i.test(raw) ? htmlToText(raw) : raw.trim()
  if (text.length > FETCH_MAX_CHARS) {
    return text.slice(0, FETCH_MAX_CHARS) + `\n[truncated — ${text.length} chars total]`
  }
  return text || '(empty response body)'
}

// ── search_web (BYO provider: Brave, Tavily, or Browserbase) ──

interface NormalizedSearchResult {
  title: string
  url: string
  snippet: string
}

const SEARCH_NOT_CONFIGURED =
  'Error: no search provider configured. Ask the user to pick a provider and add an API key in Settings > Providers > Search.'

async function braveSearch(apiKey: string, query: string, numResults: number): Promise<NormalizedSearchResult[]> {
  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search')
  endpoint.searchParams.set('q', query)
  endpoint.searchParams.set('count', String(numResults))
  const res = await fetch(endpoint, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey }
  })
  if (!res.ok) throw new Error(`Brave Search HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
  return (body.web?.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.description ?? ''
  }))
}

// Same endpoint + auth header the ProjectRose server's /api/search
// pass-through used (server/app.py) — the app now calls it directly with the
// user's own Browserbase key.
async function browserbaseSearch(apiKey: string, query: string, numResults: number): Promise<NormalizedSearchResult[]> {
  const res = await fetch('https://api.browserbase.com/v1/search', {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-bb-api-key': apiKey },
    body: JSON.stringify({ query, numResults })
  })
  if (!res.ok) throw new Error(`Browserbase HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; description?: string; snippet?: string; content?: string }>
  }
  return (body.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.description ?? r.snippet ?? r.content ?? ''
  }))
}

async function tavilySearch(apiKey: string, query: string, numResults: number): Promise<NormalizedSearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: numResults })
  })
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
  return (body.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? ''
  }))
}

export async function handleSearchWeb(input: Record<string, unknown>): Promise<string> {
  const query = String(input.query ?? '')
  if (!query) return 'Error: no query provided.'
  const settings = await readSettings()
  const provider = settings.search?.provider
  if (!provider) return SEARCH_NOT_CONFIGURED
  const apiKey = await readSearchApiKey()
  if (!apiKey) return SEARCH_NOT_CONFIGURED

  const rawCount = Number(input.numResults)
  const numResults = Number.isFinite(rawCount) && rawCount > 0 ? Math.min(20, Math.floor(rawCount)) : 10

  try {
    const results = await runSearchProvider(provider, apiKey, query, numResults)
    return JSON.stringify({ provider, query, results })
  } catch (err) {
    return `Error: search failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

function runSearchProvider(
  provider: 'brave' | 'tavily' | 'browserbase',
  apiKey: string,
  query: string,
  numResults: number
): Promise<NormalizedSearchResult[]> {
  switch (provider) {
    case 'brave':
      return braveSearch(apiKey, query, numResults)
    case 'tavily':
      return tavilySearch(apiKey, query, numResults)
    case 'browserbase':
      return browserbaseSearch(apiKey, query, numResults)
  }
}

// Exported for the settings snapshot's connection test — runs a minimal query
// against the configured provider without going through the tool layer.
export async function testSearchProvider(): Promise<{ status: string; detail?: string }> {
  const settings = await readSettings()
  const provider = settings.search?.provider
  if (!provider) return { status: 'not-configured' }
  const apiKey = await readSearchApiKey()
  if (!apiKey) return { status: 'not-configured', detail: 'provider chosen but no API key stored' }
  try {
    const results = await runSearchProvider(provider, apiKey, 'test', 1)
    return { status: 'ok', detail: `${provider}, ${results.length} result(s) for test query` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: `failed: ${msg.slice(0, 200)}` }
  }
}
