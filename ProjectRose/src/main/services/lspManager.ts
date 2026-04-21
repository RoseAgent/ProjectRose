import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'

type ServerName = 'py' | 'ts'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

interface LspServer {
  proc: ChildProcess
  buffer: Buffer
  nextId: number
  pending: Map<number, PendingRequest>
}

const servers = new Map<ServerName, LspServer>()

function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

function encode(msg: object): Buffer {
  const body = JSON.stringify(msg)
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`
  return Buffer.concat([Buffer.from(header, 'ascii'), Buffer.from(body, 'utf8')])
}

function drainMessages(server: LspServer): unknown[] {
  const out: unknown[] = []
  for (;;) {
    const sep = server.buffer.indexOf('\r\n\r\n')
    if (sep === -1) break
    const header = server.buffer.slice(0, sep).toString('ascii')
    const lenMatch = header.match(/Content-Length:\s*(\d+)/i)
    if (!lenMatch) { server.buffer = server.buffer.slice(sep + 4); continue }
    const n = parseInt(lenMatch[1], 10)
    const bodyStart = sep + 4
    if (server.buffer.length < bodyStart + n) break
    const body = server.buffer.slice(bodyStart, bodyStart + n).toString('utf8')
    server.buffer = server.buffer.slice(bodyStart + n)
    try { out.push(JSON.parse(body)) } catch { /* skip malformed */ }
  }
  return out
}

function writeMsg(server: LspServer, msg: object): void {
  if (server.proc.stdin?.writable) {
    server.proc.stdin.write(encode(msg))
  }
}

function dispatch(name: ServerName, msg: any): void {
  const server = servers.get(name)
  if (!server) return
  const fromServerChannel = name === 'py' ? IPC.LSP_PY_FROM_SERVER : IPC.LSP_TS_FROM_SERVER

  if ('id' in msg && ('result' in msg || 'error' in msg)) {
    // Response: check if it belongs to an AI-tool pending request
    const p = server.pending.get(msg.id)
    if (p) {
      clearTimeout(p.timer)
      server.pending.delete(msg.id)
      if ('error' in msg) p.reject(msg.error)
      else p.resolve(msg.result)
      return
    }
    // Otherwise forward to renderer (response to renderer's request)
  }
  // Notifications and renderer-originated responses go to renderer
  broadcast(fromServerChannel, msg)
}

function spawnServer(name: ServerName, rootPath: string): LspServer {
  let script: string
  try {
    if (name === 'py') {
      script = require.resolve('pyright/dist/pyright-langserver.js')
    } else {
      script = require.resolve('typescript-language-server/lib/cli.mjs')
    }
  } catch {
    throw new Error(`LSP binary not found for '${name}'. Run npm install.`)
  }

  const proc = spawn('node', [script, '--stdio'], {
    cwd: rootPath,
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env }
  })

  const server: LspServer = { proc, buffer: Buffer.alloc(0), nextId: 1, pending: new Map() }

  proc.stdin?.on('error', () => { /* suppress EPIPE on shutdown */ })

  proc.stdout?.on('data', (chunk: Buffer) => {
    server.buffer = Buffer.concat([server.buffer, chunk])
    for (const msg of drainMessages(server)) dispatch(name, msg)
  })

  proc.on('exit', () => servers.delete(name))

  return server
}

async function initializeServer(name: ServerName, server: LspServer, rootPath: string): Promise<void> {
  const rootUri = pathToFileURL(rootPath).href
  const initOptions: Record<string, unknown> = {}
  if (name === 'ts') {
    initOptions.logVerbosity = 'off'
    initOptions.tsserver = { logVerbosity: 'off' }
  }

  const id = server.nextId++
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.pending.delete(id)
      reject(new Error(`LSP initialize timed out for ${name}`))
    }, 20000)
    server.pending.set(id, {
      resolve: () => { clearTimeout(timer); resolve() },
      reject: (e) => { clearTimeout(timer); reject(e) },
      timer
    })
    writeMsg(server, {
      jsonrpc: '2.0', id, method: 'initialize',
      params: {
        processId: process.pid,
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
        capabilities: {
          textDocument: {
            synchronization: { didSave: true, willSave: false },
            completion: {
              completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] },
              contextSupport: true
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: {},
            references: {},
            publishDiagnostics: { relatedInformation: true }
          },
          workspace: { symbol: {}, workspaceFolders: true }
        },
        initializationOptions: initOptions
      }
    })
  })

  writeMsg(server, { jsonrpc: '2.0', method: 'initialized', params: {} })
}

export async function startLsp(rootPath: string): Promise<{ py: boolean; ts: boolean }> {
  await stopLsp()

  try {
    mkdirSync(join(rootPath, '.projectrose', 'indexing'), { recursive: true })
  } catch { /* ignore */ }

  const result = { py: false, ts: false }

  for (const name of ['py', 'ts'] as ServerName[]) {
    try {
      const server = spawnServer(name, rootPath)
      servers.set(name, server)
      await initializeServer(name, server, rootPath)
      result[name] = true
    } catch (err) {
      console.error(`[lsp] Failed to start ${name}:`, err)
      servers.get(name)?.proc.kill()
      servers.delete(name)
    }
  }

  broadcast(IPC.LSP_STARTED, result)
  return result
}

export function stopLsp(): void {
  for (const [name, server] of servers) {
    try {
      const id = server.nextId++
      writeMsg(server, { jsonrpc: '2.0', id, method: 'shutdown', params: null })
      writeMsg(server, { jsonrpc: '2.0', method: 'exit', params: null })
    } catch { /* best-effort */ }
    server.proc.kill()
    servers.delete(name)
  }
  broadcast(IPC.LSP_STOPPED, {})
}

export function sendToServer(name: ServerName, msg: object): void {
  const server = servers.get(name)
  if (server) writeMsg(server, msg)
}

export async function lspRequest(name: ServerName, method: string, params: unknown): Promise<unknown> {
  const server = servers.get(name)
  if (!server) throw new Error(`LSP server '${name}' not running`)
  const id = server.nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.pending.delete(id)
      reject(new Error(`LSP '${method}' timed out`))
    }, 10000)
    server.pending.set(id, { resolve, reject, timer })
    writeMsg(server, { jsonrpc: '2.0', id, method, params })
  })
}

export function registerLspIpcHandlers(): void {
  ipcMain.on(IPC.LSP_PY_TO_SERVER, (_event, msg: object) => sendToServer('py', msg))
  ipcMain.on(IPC.LSP_TS_TO_SERVER, (_event, msg: object) => sendToServer('ts', msg))
}
