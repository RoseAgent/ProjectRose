import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { withAugmentedPath } from '../lib/childProcessEnv'

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
  // Tail of the child's stderr, kept for failure diagnostics.
  stderrTail: string
}

// Reject every in-flight request — called when the child errors or exits so
// callers (initialize included) fail immediately with the real cause instead
// of masking it behind their own timeout.
function failAllPending(server: LspServer, reason: Error): void {
  for (const p of server.pending.values()) {
    clearTimeout(p.timer)
    p.reject(reason)
  }
  server.pending.clear()
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

  // A Conversation can bind a Workspace whose folder no longer exists; spawn
  // with a missing cwd dies instantly on Windows. Fail with the real reason.
  if (!existsSync(rootPath)) {
    throw new Error(`workspace folder does not exist: ${rootPath}`)
  }

  // Use Electron's own binary as the Node runtime instead of relying on a
  // system `node` on PATH. When launched from Finder on macOS, the app gets
  // a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) and `spawn('node')`
  // fails with ENOENT. `ELECTRON_RUN_AS_NODE=1` makes Electron behave as a
  // plain Node interpreter; the LSP servers don't care which binary is
  // running their JS.
  const proc = spawn(process.execPath, [script, '--stdio'], {
    cwd: rootPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: withAugmentedPath({ ...process.env, ELECTRON_RUN_AS_NODE: '1' })
  })

  const server: LspServer = { proc, buffer: Buffer.alloc(0), nextId: 1, pending: new Map(), stderrTail: '' }

  proc.stdin?.on('error', () => { /* suppress EPIPE on shutdown */ })

  // Keep the tail of stderr so a dying server reports *why* it died instead
  // of the generic initialize timeout that used to mask everything.
  proc.stderr?.on('data', (chunk: Buffer) => {
    server.stderrTail = (server.stderrTail + chunk.toString('utf-8')).slice(-2000)
  })

  // spawn() reports failures asynchronously through 'error'. Without a
  // listener the error bubbles up as an uncaughtException, which Electron
  // surfaces to the user as a modal dialog. Keep it as a log line — and fail
  // any in-flight request (initialize included) immediately.
  proc.on('error', (err) => {
    console.error(`[lsp] ${name} child process error:`, err)
    failAllPending(server, new Error(`${name} language server failed to spawn: ${err.message}`))
    servers.delete(name)
  })

  proc.stdout?.on('data', (chunk: Buffer) => {
    server.buffer = Buffer.concat([server.buffer, chunk])
    for (const msg of drainMessages(server)) dispatch(name, msg)
  })

  proc.on('exit', (code, signal) => {
    if (server.pending.size > 0) {
      const stderr = server.stderrTail.trim()
      failAllPending(
        server,
        new Error(
          `${name} language server exited (code ${code}${signal ? `, signal ${signal}` : ''})` +
            (stderr ? `\n[stderr] ${stderr}` : '')
        )
      )
    }
    servers.delete(name)
  })

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
