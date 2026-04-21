import { spawn, type ChildProcess } from 'child_process'
import type { Dirent } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'

export interface DockerContainer {
  id: string
  name: string
  image: string
  service?: string
  composeFile?: string
  state: string
  status: string
  ports: string
  createdAt: string
}

export interface DockerMount {
  Source: string
  Destination: string
  Type: string
}

export interface DockerDirEntry {
  name: string
  type: 'file' | 'dir' | 'link' | 'other'
  size: number
}

const ID_RE = /^[a-zA-Z0-9_.\-]+$/
const PATH_FORBIDDEN = /[;|`$\n"']|\\/

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'release', 'dist'])
const COMPOSE_RE = /^(docker-compose|compose)(\.[^.]+)?\.(ya?ml)$/i

interface RunResult {
  stdout: string
  stderr: string
  code: number
}

function run(cmd: string, args: string[], timeoutMs = 15_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let done = false
    let proc: ChildProcess
    try {
      proc = spawn(cmd, args, { shell: false })
    } catch (err) {
      resolve({ stdout: '', stderr: String(err), code: -1 })
      return
    }
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { proc.kill() } catch {}
      resolve({ stdout, stderr: stderr + '\n[timeout]', code: -1 })
    }, timeoutMs)
    proc.stdout?.on('data', (d) => { stdout += d.toString() })
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ stdout, stderr: stderr + String(err), code: -1 })
    })
    proc.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code: code ?? -1 })
    })
  })
}

let checkCache: { installed: boolean; version?: string } | null = null

export async function checkDocker(): Promise<{ installed: boolean; version?: string }> {
  if (checkCache) return checkCache
  const res = await run('docker', ['version', '--format', '{{json .}}'])
  if (res.code !== 0 || !res.stdout.trim()) {
    checkCache = { installed: false }
    return checkCache
  }
  try {
    const parsed = JSON.parse(res.stdout.trim())
    const version = parsed?.Client?.Version ?? parsed?.Server?.Version
    checkCache = { installed: true, version }
  } catch {
    checkCache = { installed: true }
  }
  return checkCache
}

export async function findComposeFiles(rootPath: string): Promise<string[]> {
  const found: string[] = []

  async function scan(dir: string, depth: number): Promise<void> {
    let entries: Dirent[]
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as unknown as Dirent[]
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (depth >= 1) continue
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await scan(join(dir, entry.name), depth + 1)
      } else if (entry.isFile() && COMPOSE_RE.test(entry.name)) {
        found.push(join(dir, entry.name))
      }
    }
  }

  await scan(rootPath, 0)
  return found
}

function mapPsRow(row: Record<string, unknown>, composeFile: string): DockerContainer {
  const id = String(row.ID ?? row.Id ?? '')
  return {
    id,
    name: String(row.Name ?? row.Names ?? ''),
    image: String(row.Image ?? ''),
    service: row.Service ? String(row.Service) : undefined,
    composeFile,
    state: String(row.State ?? ''),
    status: String(row.Status ?? ''),
    ports: String(row.Publishers ? JSON.stringify(row.Publishers) : (row.Ports ?? '')),
    createdAt: String(row.CreatedAt ?? row.Created ?? '')
  }
}

export async function listContainers(composeFiles: string[]): Promise<DockerContainer[]> {
  const results: DockerContainer[] = []
  for (const file of composeFiles) {
    const res = await run('docker', ['compose', '-f', file, 'ps', '--format', 'json', '--all'])
    if (res.code !== 0) {
      console.error(`docker compose ps failed for ${file}: ${res.stderr}`)
      continue
    }
    const out = res.stdout.trim()
    if (!out) continue
    // Newer docker compose emits line-delimited JSON; older emits a JSON array.
    const first = out[0]
    try {
      if (first === '[') {
        const arr = JSON.parse(out) as Record<string, unknown>[]
        for (const row of arr) results.push(mapPsRow(row, file))
      } else {
        for (const line of out.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const row = JSON.parse(trimmed) as Record<string, unknown>
          results.push(mapPsRow(row, file))
        }
      }
    } catch (err) {
      console.error(`Failed to parse docker compose ps output for ${file}:`, err)
    }
  }
  return results
}

export async function inspect(id: string): Promise<unknown> {
  if (!ID_RE.test(id)) throw new Error('Invalid container id')
  const res = await run('docker', ['inspect', id])
  if (res.code !== 0) throw new Error(res.stderr.trim() || 'docker inspect failed')
  const parsed = JSON.parse(res.stdout)
  return Array.isArray(parsed) ? parsed[0] : parsed
}

async function lifecycle(action: 'start' | 'stop' | 'restart', id: string): Promise<{ ok: boolean; error?: string }> {
  if (!ID_RE.test(id)) return { ok: false, error: 'Invalid container id' }
  const res = await run('docker', [action, id], 60_000)
  if (res.code === 0) return { ok: true }
  return { ok: false, error: res.stderr.trim() || `docker ${action} failed` }
}

export function start(id: string): Promise<{ ok: boolean; error?: string }> { return lifecycle('start', id) }
export function stop(id: string): Promise<{ ok: boolean; error?: string }> { return lifecycle('stop', id) }
export function restart(id: string): Promise<{ ok: boolean; error?: string }> { return lifecycle('restart', id) }

const logSessions = new Map<string, ChildProcess>()
let sessionCounter = 0

export function subscribeLogs(
  id: string,
  tail: number,
  onData: (chunk: string) => void,
  onExit: (code: number) => void
): string {
  if (!ID_RE.test(id)) throw new Error('Invalid container id')
  const safeTail = Number.isFinite(tail) && tail >= 0 ? Math.floor(tail) : 500
  const sessionId = `docker-logs-${++sessionCounter}`
  const proc = spawn('docker', ['logs', '-f', '--tail', String(safeTail), id], { shell: false })
  logSessions.set(sessionId, proc)
  proc.stdout?.on('data', (d) => onData(d.toString()))
  proc.stderr?.on('data', (d) => onData(d.toString()))
  proc.on('error', (err) => onData(`[docker logs error: ${String(err)}]\n`))
  proc.on('close', (code) => {
    logSessions.delete(sessionId)
    onExit(code ?? -1)
  })
  return sessionId
}

export function unsubscribeLogs(sessionId: string): void {
  const proc = logSessions.get(sessionId)
  if (!proc) return
  logSessions.delete(sessionId)
  try { proc.kill() } catch {}
}

export function disposeAllDockerSessions(): void {
  for (const [id, proc] of logSessions) {
    try { proc.kill() } catch {}
    logSessions.delete(id)
  }
}

function classifyType(first: string): DockerDirEntry['type'] {
  if (first === 'd') return 'dir'
  if (first === '-') return 'file'
  if (first === 'l') return 'link'
  return 'other'
}

export async function listFiles(id: string, path: string): Promise<{ entries: DockerDirEntry[] }> {
  if (!ID_RE.test(id)) throw new Error('Invalid container id')
  if (!path.startsWith('/')) throw new Error('Path must be absolute')
  if (PATH_FORBIDDEN.test(path)) throw new Error('Path contains forbidden characters')
  const res = await run('docker', ['exec', id, 'ls', '-la', '--time-style=+%s', path])
  if (res.code !== 0) throw new Error(res.stderr.trim() || 'docker exec ls failed')
  const entries: DockerDirEntry[] = []
  const lines = res.stdout.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    if (/^total\s+\d+/.test(line)) continue
    // Example: drwxr-xr-x 2 root root 4096 1700000000 name
    const match = line.match(/^(\S)\S{9}\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+(.+?)\s*$/)
    if (!match) continue
    const type = classifyType(match[1])
    const size = Number(match[2]) || 0
    let name = match[3]
    if (type === 'link') {
      const arrow = name.indexOf(' -> ')
      if (arrow !== -1) name = name.slice(0, arrow)
    }
    if (name === '.' || name === '..') continue
    entries.push({ name, type, size })
  }
  return { entries }
}

export async function getMounts(id: string): Promise<DockerMount[]> {
  const data = (await inspect(id)) as { Mounts?: DockerMount[] } | null
  if (!data || !Array.isArray(data.Mounts)) return []
  return data.Mounts.map((m) => ({ Source: m.Source, Destination: m.Destination, Type: m.Type }))
}
