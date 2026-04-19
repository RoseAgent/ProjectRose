import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { readFile, writeFile, readdir, stat } from 'fs/promises'
import { join, relative, extname } from 'path'
import { execSync } from 'child_process'
import { platform } from 'os'
import { randomBytes } from 'crypto'
import { roseLibraryClient, setActiveProjectRoot } from './roseLibraryClient'
import { isIndexableFile } from './fileService'
import { BrowserWindow } from 'electron'

const roseLibrary = roseLibraryClient

let server: Server | null = null
let serverPort = 0
let projectRoot = ''
let authToken = ''

// host.docker.internal resolves to the host from inside containers (Docker Desktop
// on Win/Mac, or via extra_hosts: ["host.docker.internal:host-gateway"] on Linux).
// Override with ROSE_CALLBACK_HOST for non-Docker deployments.
const callbackHost = process.env.ROSE_CALLBACK_HOST || 'host.docker.internal'

// Track which files the AI has modified so the renderer can refresh
const modifiedFiles: string[] = []

export function getCallbackBaseUrl(): string {
  return `http://${callbackHost}:${serverPort}/${authToken}`
}

export function getModifiedFiles(): string[] {
  return modifiedFiles.splice(0)
}

function notifyRenderer(event: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(event, data)
    }
  }
}

// ── Tool handlers ──

async function handleReadFile(params: Record<string, unknown>): Promise<string> {
  const filePath = String(params.path || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)

  const content = await readFile(absolute, 'utf-8')
  return content
}

async function handleWriteFile(params: Record<string, unknown>): Promise<string> {
  const filePath = String(params.path || '')
  const content = String(params.content || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)

  await writeFile(absolute, content, 'utf-8')
  modifiedFiles.push(absolute)

  // Notify renderer that a file changed
  notifyRenderer('ai:fileModified', { path: absolute })

  // Update RoseLibrary index if indexable
  if (isIndexableFile(absolute) && projectRoot) {
    const rel = relative(projectRoot, absolute).replace(/\\/g, '/')
    try {
      await roseLibrary.updateFiles([{ path: rel, content }])
    } catch {}
  }

  return `File written: ${filePath}`
}

async function handleListDirectory(params: Record<string, unknown>): Promise<string> {
  const dirPath = String(params.path || '.')
  const absolute = dirPath.startsWith('/') || dirPath.includes(':')
    ? dirPath
    : join(projectRoot, dirPath)

  const entries = await readdir(absolute, { withFileTypes: true })
  const items = entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? 'directory' : 'file'
  }))

  return JSON.stringify(items)
}

async function handleSearchCode(params: Record<string, unknown>): Promise<string> {
  const query = String(params.query || '')
  const limit = Number(params.limit) || 10

  const results = await roseLibrary.search({ query, limit })
  return JSON.stringify(results)
}

async function handleFindReferences(params: Record<string, unknown>): Promise<string> {
  const symbolName = String(params.symbol_name || '')
  const filePath = params.file_path ? String(params.file_path) : undefined
  const direction = (params.direction as 'inbound' | 'outbound' | 'both') || 'both'

  const results = await roseLibrary.findReferences({
    symbol_name: symbolName,
    file_path: filePath,
    direction
  })
  return JSON.stringify(results)
}

async function handleGetProjectOverview(): Promise<string> {
  const overview = await roseLibrary.overview()

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

async function handleRunCommand(params: Record<string, unknown>): Promise<string> {
  const command = String(params.command || '')
  const isWindows = platform() === 'win32'

  try {
    const output = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      shell: isWindows ? 'powershell.exe' : '/bin/bash'
    })
    return output
  } catch (err: any) {
    return `Command failed (exit ${err.status || 1}):\n${err.stderr || err.message}`
  }
}

const TOOL_HANDLERS: Record<string, (params: Record<string, unknown>) => Promise<string>> = {
  read_file: handleReadFile,
  write_file: handleWriteFile,
  list_directory: handleListDirectory,
  search_code: handleSearchCode,
  find_references: handleFindReferences,
  run_command: handleRunCommand,
  get_project_overview: handleGetProjectOverview
}

// ── HTTP server ──

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || ''
  // URL format: /<authToken>/tools/<tool_name>
  const match = url.match(/^\/([a-f0-9]+)\/tools\/([a-z_]+)/)

  if (!match || match[1] !== authToken) {
    res.writeHead(match ? 403 : 404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: match ? 'Forbidden' : 'Not found' }))
    return
  }

  const toolName = match[2]
  const handler = TOOL_HANDLERS[toolName]

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }))
    return
  }

  parseBody(req)
    .then(async (params) => {
      try {
        const content = await handler(params)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, content, error: null }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`Tool ${toolName} error:`, err)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, content: null, error: message }))
      }
    })
}

// ── Lifecycle ──

export function startCallbackServer(rootPath: string): Promise<number> {
  projectRoot = rootPath
  setActiveProjectRoot(rootPath)

  return new Promise((resolve, reject) => {
    if (server) {
      // Already running, just update project root
      resolve(serverPort)
      return
    }

    server = createServer(handleRequest)
    authToken = randomBytes(16).toString('hex')

    // Bind to 0.0.0.0 so Docker containers can reach the host via host.docker.internal.
    // The authToken in the URL path prevents unauthorized LAN access.
    server.listen(0, '0.0.0.0', () => {
      const addr = server!.address()
      if (addr && typeof addr !== 'string') {
        serverPort = addr.port
        console.log(`AI callback server listening on port ${serverPort} (host: ${callbackHost})`)
        resolve(serverPort)
      } else {
        reject(new Error('Failed to get server port'))
      }
    })

    server.on('error', reject)
  })
}

export function stopCallbackServer(): void {
  if (server) {
    server.close()
    server = null
    serverPort = 0
  }
}

export function updateProjectRoot(rootPath: string): void {
  projectRoot = rootPath
  setActiveProjectRoot(rootPath)
}
