import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

// Conversations are grouped on disk by the Workspace they belong to. The group
// directory name mirrors Claude Code's encoding scheme — every character that
// is not an ASCII letter or digit becomes a dash — so ProjectRose's layout is
// legible next to `~/.claude/projects`. The scheme is LOSSY (path separators,
// colons, and literal dashes are indistinguishable), so we NEVER decode a
// directory name back into a path: the real absolute path is stored verbatim
// in each group's `workspace.json`.

export const WORKSPACE_META_FILE = 'workspace.json'

export interface WorkspaceMeta {
  path: string
  createdAt: number
}

export function encodeWorkspacePath(realPath: string): string {
  return normalizeTrailing(realPath).replace(/[^A-Za-z0-9]/g, '-')
}

// Strip trailing separators so `C:\foo` and `C:\foo\` encode identically.
function normalizeTrailing(p: string): string {
  return p.replace(/[\\/]+$/, '')
}

// win32 paths are case-insensitive; compare canonically so `C:\Foo` and
// `c:\foo` are treated as the same Workspace.
export function sameWorkspacePath(a: string, b: string): boolean {
  const na = normalizeTrailing(a)
  const nb = normalizeTrailing(b)
  if (process.platform === 'win32') return na.toLowerCase() === nb.toLowerCase()
  return na === nb
}

function shortHash(realPath: string): string {
  return createHash('sha1').update(normalizeTrailing(realPath)).digest('hex').slice(0, 8)
}

async function readMeta(dir: string): Promise<WorkspaceMeta | null> {
  try {
    const raw = await fs.readFile(join(dir, WORKSPACE_META_FILE), 'utf-8')
    const meta = JSON.parse(raw) as WorkspaceMeta
    return meta && typeof meta.path === 'string' ? meta : null
  } catch {
    return null
  }
}

// Resolve (without creating) the group directory for a Workspace under
// `conversationsRoot`. Guarantees a stable, collision-free mapping:
//   1. If an existing group's workspace.json already names this real path
//      (case-insensitive on win32), reuse it — even if its encoded name
//      differs (e.g. it was created under different casing).
//   2. Otherwise use the encoded name. If that directory already exists but
//      names a DIFFERENT real path, suffix with an 8-char hash of the path so
//      the two never share a directory.
export async function resolveGroupDir(conversationsRoot: string, realPath: string): Promise<string> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(conversationsRoot)
  } catch {
    entries = []
  }

  // (1) Reuse a group that already claims this exact path.
  for (const entry of entries) {
    const dir = join(conversationsRoot, entry)
    const meta = await readMeta(dir)
    if (meta && sameWorkspacePath(meta.path, realPath)) return dir
  }

  // (2) Encoded name, with hash-suffix fallback on collision.
  const encoded = encodeWorkspacePath(realPath)
  const encodedDir = join(conversationsRoot, encoded)
  const existing = await readMeta(encodedDir)
  if (!existing || sameWorkspacePath(existing.path, realPath)) return encodedDir
  return join(conversationsRoot, `${encoded}-${shortHash(realPath)}`)
}

// Ensure the group dir exists and its workspace.json records the real path.
export async function ensureGroupDir(conversationsRoot: string, realPath: string): Promise<string> {
  const dir = await resolveGroupDir(conversationsRoot, realPath)
  await fs.mkdir(dir, { recursive: true })
  const existing = await readMeta(dir)
  if (!existing) {
    const meta: WorkspaceMeta = { path: realPath, createdAt: Date.now() }
    await fs.writeFile(join(dir, WORKSPACE_META_FILE), JSON.stringify(meta, null, 2), 'utf-8')
  }
  return dir
}

export { readMeta as readWorkspaceMeta }
