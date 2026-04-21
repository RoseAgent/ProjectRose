import { spawn, type ChildProcess } from 'child_process'
import { watch, type FSWatcher } from 'fs'
import { readFile as fsReadFile } from 'fs/promises'
import { join } from 'path'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export interface GitCommit {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  timestamp: number
  parents: string[]
  subject: string
  body: string
}

export interface GitFileChange {
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'
  path: string
  oldPath?: string
}

export interface GitCommitDetail extends GitCommit {
  files: GitFileChange[]
}

export interface GitBranch {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream?: string
  sha: string
  lastCommitDate?: string
}

export interface GitRemote {
  name: string
  url: string
}

export interface GitTag {
  name: string
  sha: string
}

export interface GitStash {
  index: number
  message: string
  sha: string
}

export interface GitStatus {
  currentBranch: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
  conflicted: GitFileChange[]
}

export interface GitOpResult {
  ok: boolean
  error?: string
}

const DEFAULT_TIMEOUT = 5_000
const FORBIDDEN_REF_CHARS = /[\x00-\x1f\x7f~^:?*\[\\]/

export function safeRef(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  if (name.includes('..')) return false
  if (name.includes('//')) return false
  if (FORBIDDEN_REF_CHARS.test(name)) return false
  if (name.startsWith('-')) return false
  if (name.startsWith('/')) return false
  if (name.endsWith('/')) return false
  if (name.endsWith('.lock')) return false
  if (name.endsWith('.')) return false
  return true
}

export function runGit(
  cwd: string,
  args: string[],
  opts?: { stdin?: string; timeoutMs?: number }
): Promise<RunResult> {
  return new Promise((resolve) => {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT
    let stdout = ''
    let stderr = ''
    let done = false
    let proc: ChildProcess
    try {
      proc = spawn('git', args, { cwd, shell: false })
    } catch (err) {
      resolve({ stdout: '', stderr: String(err), code: -1 })
      return
    }

    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { proc.kill('SIGKILL') } catch {}
      resolve({ stdout, stderr: stderr + `\n[timeout after ${timeoutMs}ms]`, code: -1 })
    }, timeoutMs)

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
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

    if (opts?.stdin != null) {
      try {
        proc.stdin?.write(opts.stdin)
      } catch {}
    }
    try { proc.stdin?.end() } catch {}
  })
}

async function runOk(cwd: string, args: string[], opts?: { stdin?: string; timeoutMs?: number }): Promise<GitOpResult> {
  const r = await runGit(cwd, args, opts)
  if (r.code === 0) return { ok: true }
  return { ok: false, error: (r.stderr || r.stdout).trim() || `git exited ${r.code}` }
}

export async function isRepo(cwd: string): Promise<boolean> {
  const r = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  return r.code === 0 && r.stdout.trim() === 'true'
}

function mapStatusCode(xy: string): GitFileChange['status'] {
  const c = xy.trim()[0]
  switch (c) {
    case 'A': return 'A'
    case 'M': return 'M'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'C': return 'C'
    case 'T': return 'T'
    case 'U': return 'U'
    case '?': return '?'
    default: return 'M'
  }
}

export async function status(cwd: string): Promise<GitStatus> {
  const r = await runGit(cwd, ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'])
  const out: GitStatus = {
    currentBranch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: []
  }
  if (r.code !== 0) return out

  const raw = r.stdout
  // porcelain=v2 -z: branch headers start with "# branch.*" separated by NUL
  // Entries: "1 XY ... <path>\0" or "2 XY ... <path>\0<origPath>\0" or "u XY ... <path>\0" or "? <path>\0"
  // Branch headers don't contain NUL but are NUL-terminated.
  let i = 0
  while (i < raw.length) {
    const nul = raw.indexOf('\0', i)
    if (nul === -1) break
    const chunk = raw.slice(i, nul)
    i = nul + 1
    if (chunk.length === 0) continue
    if (chunk.startsWith('# ')) {
      // e.g. "# branch.oid abc", "# branch.head main", "# branch.upstream origin/main", "# branch.ab +1 -2"
      const body = chunk.slice(2)
      if (body.startsWith('branch.head ')) {
        const v = body.slice('branch.head '.length)
        out.currentBranch = v === '(detached)' ? null : v
      } else if (body.startsWith('branch.upstream ')) {
        out.upstream = body.slice('branch.upstream '.length)
      } else if (body.startsWith('branch.ab ')) {
        const m = body.match(/\+(-?\d+) -(-?\d+)/)
        if (m) {
          out.ahead = parseInt(m[1], 10) || 0
          out.behind = parseInt(m[2], 10) || 0
        }
      }
      continue
    }
    const type = chunk[0]
    if (type === '1') {
      // 1 XY sub mH mI mW hH hI path
      const parts = chunk.split(' ')
      const xy = parts[1] || '  '
      const path = parts.slice(8).join(' ')
      const x = xy[0]
      const y = xy[1]
      if (x !== '.' && x !== ' ') out.staged.push({ status: mapStatusCode(x), path })
      if (y !== '.' && y !== ' ') out.unstaged.push({ status: mapStatusCode(y), path })
    } else if (type === '2') {
      // 2 XY sub mH mI mW hH hI X<score> <path>\0<origPath>
      const parts = chunk.split(' ')
      const xy = parts[1] || '  '
      const path = parts.slice(9).join(' ')
      const nul2 = raw.indexOf('\0', i)
      let origPath = ''
      if (nul2 !== -1) {
        origPath = raw.slice(i, nul2)
        i = nul2 + 1
      }
      const x = xy[0]
      const y = xy[1]
      if (x !== '.' && x !== ' ') out.staged.push({ status: mapStatusCode(x), path, oldPath: origPath })
      if (y !== '.' && y !== ' ') out.unstaged.push({ status: mapStatusCode(y), path, oldPath: origPath })
    } else if (type === 'u') {
      const parts = chunk.split(' ')
      const path = parts.slice(10).join(' ')
      out.conflicted.push({ status: 'U', path })
    } else if (type === '?') {
      const path = chunk.slice(2)
      out.untracked.push({ status: '?', path })
    }
  }
  return out
}

export async function log(
  cwd: string,
  opts?: { limit?: number; skip?: number; ref?: string; filePath?: string }
): Promise<GitCommit[]> {
  const limit = opts?.limit ?? 100
  const skip = opts?.skip ?? 0
  const fmt = '%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%s%x1f%b'
  const args = ['log', '-z', `--format=${fmt}`, `--max-count=${limit}`, `--skip=${skip}`]
  if (opts?.ref) {
    if (!safeRef(opts.ref)) return []
    args.push(opts.ref)
  }
  if (opts?.filePath) {
    args.push('--', opts.filePath)
  }
  const r = await runGit(cwd, args)
  if (r.code !== 0) return []
  const records = r.stdout.split('\x00').filter((s) => s.length > 0)
  const out: GitCommit[] = []
  for (const rec of records) {
    const fields = rec.split('\x1f')
    if (fields.length < 8) continue
    const [sha, shortSha, authorName, authorEmail, ts, parents, subject, ...bodyParts] = fields
    out.push({
      sha,
      shortSha,
      authorName,
      authorEmail,
      timestamp: parseInt(ts, 10) || 0,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      subject,
      body: bodyParts.join('\x1f')
    })
  }
  return out
}

function parseNameStatus(raw: string): GitFileChange[] {
  const parts = raw.split('\x00').filter((s) => s.length > 0)
  const files: GitFileChange[] = []
  let i = 0
  while (i < parts.length) {
    const code = parts[i]
    if (!code) { i++; continue }
    const letter = code[0] as GitFileChange['status']
    if (letter === 'R' || letter === 'C') {
      const oldPath = parts[i + 1]
      const newPath = parts[i + 2]
      if (newPath) {
        files.push({ status: letter, path: newPath, oldPath })
      }
      i += 3
    } else {
      const p = parts[i + 1]
      if (p) {
        files.push({
          status: (['A', 'M', 'D', 'T', 'U'].includes(letter) ? letter : 'M') as GitFileChange['status'],
          path: p
        })
      }
      i += 2
    }
  }
  return files
}

export async function show(cwd: string, sha: string): Promise<GitCommitDetail> {
  if (!safeRef(sha)) throw new Error('invalid sha')
  const fmt = '%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%s%x1f%b'
  const headerR = await runGit(cwd, ['show', '-s', `--format=${fmt}`, sha])
  const fields = headerR.stdout.replace(/\x00$/, '').split('\x1f')
  const [sha0, shortSha, authorName, authorEmail, ts, parents, subject, ...bodyParts] = fields
  const filesR = await runGit(cwd, ['show', '--name-status', '-z', '--format=', sha])
  const files = parseNameStatus(filesR.stdout)
  return {
    sha: sha0 || sha,
    shortSha: shortSha || sha.slice(0, 7),
    authorName: authorName || '',
    authorEmail: authorEmail || '',
    timestamp: parseInt(ts, 10) || 0,
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    subject: subject || '',
    body: bodyParts.join('\x1f'),
    files
  }
}

async function isBinaryFile(cwd: string, sha: string, path: string): Promise<boolean> {
  const r = await runGit(cwd, ['diff', '--numstat', `${sha}^`, sha, '--', path])
  const firstLine = r.stdout.split('\n')[0] || ''
  return firstLine.startsWith('-\t-\t')
}

async function showBlob(cwd: string, ref: string, path: string): Promise<string> {
  const r = await runGit(cwd, ['show', `${ref}:${path}`])
  if (r.code !== 0) return ''
  return r.stdout
}

export async function diffFile(
  cwd: string,
  params: { sha: string; path: string }
): Promise<{ oldContent: string; newContent: string; binary?: boolean }> {
  const { sha, path } = params
  if (!safeRef(sha)) return { oldContent: '', newContent: '', binary: false }
  if (await isBinaryFile(cwd, sha, path)) {
    return { oldContent: '', newContent: '', binary: true }
  }
  const [oldContent, newContent] = await Promise.all([
    showBlob(cwd, `${sha}^`, path),
    showBlob(cwd, sha, path)
  ])
  return { oldContent, newContent }
}

export async function diffWorking(
  cwd: string,
  params: { path: string; staged?: boolean }
): Promise<{ oldContent: string; newContent: string; binary?: boolean }> {
  const { path, staged } = params
  // Detect binary via --numstat against HEAD for the file
  const numstatR = await runGit(cwd, ['diff', '--numstat', 'HEAD', '--', path])
  if ((numstatR.stdout.split('\n')[0] || '').startsWith('-\t-\t')) {
    return { oldContent: '', newContent: '', binary: true }
  }
  if (staged) {
    // staged: compare HEAD blob (old) to index blob (new)
    const [oldContent, newContent] = await Promise.all([
      showBlob(cwd, 'HEAD', path),
      showBlob(cwd, '', path)
    ])
    return { oldContent, newContent }
  }
  // unstaged: compare index blob (old) to working file (new)
  const oldContent = await showBlob(cwd, '', path)
  let newContent = ''
  try {
    newContent = await fsReadFile(join(cwd, path), 'utf8')
  } catch {}
  return { oldContent, newContent }
}

export async function branches(cwd: string): Promise<GitBranch[]> {
  const fmt = '%(refname)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(committerdate:iso-strict)'
  const r = await runGit(cwd, [
    'for-each-ref',
    '--format=' + fmt,
    'refs/heads',
    'refs/remotes'
  ])
  if (r.code !== 0) return []
  const out: GitBranch[] = []
  for (const line of r.stdout.split('\n')) {
    if (!line) continue
    const [refname, sha, head, upstream, date] = line.split('\x00')
    const isRemote = refname.startsWith('refs/remotes/')
    const name = isRemote
      ? refname.slice('refs/remotes/'.length)
      : refname.slice('refs/heads/'.length)
    if (isRemote && name.endsWith('/HEAD')) continue
    out.push({
      name,
      isCurrent: head === '*',
      isRemote,
      upstream: upstream || undefined,
      sha,
      lastCommitDate: date || undefined
    })
  }
  return out
}

export async function remotes(cwd: string): Promise<GitRemote[]> {
  const r = await runGit(cwd, ['remote', '-v'])
  if (r.code !== 0) return []
  const map = new Map<string, string>()
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/)
    if (!m) continue
    if (m[3] === 'fetch') map.set(m[1], m[2])
  }
  return Array.from(map.entries()).map(([name, url]) => ({ name, url }))
}

export async function tags(cwd: string): Promise<GitTag[]> {
  const fmt = '%(refname:short)%00%(objectname)'
  const r = await runGit(cwd, ['for-each-ref', '--format=' + fmt, 'refs/tags'])
  if (r.code !== 0) return []
  const out: GitTag[] = []
  for (const line of r.stdout.split('\n')) {
    if (!line) continue
    const [name, sha] = line.split('\x00')
    out.push({ name, sha })
  }
  return out
}

export async function stashes(cwd: string): Promise<GitStash[]> {
  const r = await runGit(cwd, ['stash', 'list', '--format=%gd%x1f%H%x1f%s'])
  if (r.code !== 0) return []
  const out: GitStash[] = []
  let index = 0
  for (const line of r.stdout.split('\n')) {
    if (!line) continue
    const [, sha, message] = line.split('\x1f')
    out.push({ index, message: message || '', sha: sha || '' })
    index++
  }
  return out
}

export async function checkout(cwd: string, ref: string): Promise<GitOpResult> {
  if (!safeRef(ref)) return { ok: false, error: 'invalid ref name' }
  return runOk(cwd, ['checkout', ref])
}

export async function branchCreate(cwd: string, params: { name: string; startPoint?: string }): Promise<GitOpResult> {
  if (!safeRef(params.name)) return { ok: false, error: 'invalid branch name' }
  if (params.startPoint && !safeRef(params.startPoint)) return { ok: false, error: 'invalid start point' }
  const args = ['branch', params.name]
  if (params.startPoint) args.push(params.startPoint)
  return runOk(cwd, args)
}

export async function branchDelete(cwd: string, params: { name: string; force?: boolean }): Promise<GitOpResult> {
  if (!safeRef(params.name)) return { ok: false, error: 'invalid branch name' }
  return runOk(cwd, ['branch', params.force ? '-D' : '-d', params.name])
}

export async function branchRename(cwd: string, params: { oldName: string; newName: string }): Promise<GitOpResult> {
  if (!safeRef(params.oldName) || !safeRef(params.newName)) return { ok: false, error: 'invalid branch name' }
  return runOk(cwd, ['branch', '-m', params.oldName, params.newName])
}

export async function fetch(cwd: string, remote?: string): Promise<GitOpResult> {
  if (remote && !safeRef(remote)) return { ok: false, error: 'invalid remote' }
  const args = ['fetch']
  if (remote) args.push(remote)
  return runOk(cwd, args, { timeoutMs: 120_000 })
}

export async function pull(cwd: string, params?: { remote?: string; branch?: string }): Promise<GitOpResult> {
  if (params?.remote && !safeRef(params.remote)) return { ok: false, error: 'invalid remote' }
  if (params?.branch && !safeRef(params.branch)) return { ok: false, error: 'invalid branch' }
  const args = ['pull']
  if (params?.remote) args.push(params.remote)
  if (params?.branch) args.push(params.branch)
  return runOk(cwd, args, { timeoutMs: 120_000 })
}

export async function push(cwd: string, params?: { remote?: string; branch?: string; force?: boolean }): Promise<GitOpResult> {
  if (params?.remote && !safeRef(params.remote)) return { ok: false, error: 'invalid remote' }
  if (params?.branch && !safeRef(params.branch)) return { ok: false, error: 'invalid branch' }
  const args = ['push']
  if (params?.force) args.push('--force-with-lease')
  if (params?.remote) args.push(params.remote)
  if (params?.branch) args.push(params.branch)
  return runOk(cwd, args, { timeoutMs: 120_000 })
}

export async function stage(cwd: string, paths: string[]): Promise<GitOpResult> {
  if (!Array.isArray(paths) || paths.length === 0) return { ok: false, error: 'no paths' }
  return runOk(cwd, ['add', '--', ...paths])
}

export async function unstage(cwd: string, paths: string[]): Promise<GitOpResult> {
  if (!Array.isArray(paths) || paths.length === 0) return { ok: false, error: 'no paths' }
  return runOk(cwd, ['reset', 'HEAD', '--', ...paths])
}

export async function discard(cwd: string, paths: string[]): Promise<GitOpResult> {
  if (!Array.isArray(paths) || paths.length === 0) return { ok: false, error: 'no paths' }
  return runOk(cwd, ['checkout', '--', ...paths])
}

export async function commit(cwd: string, params: { message: string; amend?: boolean; allowEmpty?: boolean }): Promise<GitOpResult> {
  const args = ['commit', '-F', '-']
  if (params.amend) args.push('--amend')
  if (params.allowEmpty) args.push('--allow-empty')
  return runOk(cwd, args, { stdin: params.message ?? '' })
}

export async function cherryPick(cwd: string, sha: string): Promise<GitOpResult> {
  if (!safeRef(sha)) return { ok: false, error: 'invalid sha' }
  return runOk(cwd, ['cherry-pick', sha])
}

export async function revert(cwd: string, sha: string): Promise<GitOpResult> {
  if (!safeRef(sha)) return { ok: false, error: 'invalid sha' }
  return runOk(cwd, ['revert', '--no-edit', sha])
}

export async function merge(cwd: string, ref: string): Promise<GitOpResult> {
  if (!safeRef(ref)) return { ok: false, error: 'invalid ref' }
  return runOk(cwd, ['merge', ref], { timeoutMs: 60_000 })
}

export async function rebase(cwd: string, ref: string): Promise<GitOpResult> {
  if (!safeRef(ref)) return { ok: false, error: 'invalid ref' }
  return runOk(cwd, ['rebase', ref], { timeoutMs: 60_000 })
}

export async function reset(cwd: string, params: { target: string; mode: 'soft' | 'mixed' | 'hard' }): Promise<GitOpResult> {
  if (!safeRef(params.target)) return { ok: false, error: 'invalid target' }
  const flag = params.mode === 'hard' ? '--hard' : params.mode === 'soft' ? '--soft' : '--mixed'
  return runOk(cwd, ['reset', flag, params.target])
}

export async function tagCreate(cwd: string, params: { name: string; ref?: string; message?: string }): Promise<GitOpResult> {
  if (!safeRef(params.name)) return { ok: false, error: 'invalid tag name' }
  if (params.ref && !safeRef(params.ref)) return { ok: false, error: 'invalid ref' }
  const args = ['tag']
  if (params.message) {
    args.push('-a', params.name, '-F', '-')
    if (params.ref) args.push(params.ref)
    return runOk(cwd, args, { stdin: params.message })
  }
  args.push(params.name)
  if (params.ref) args.push(params.ref)
  return runOk(cwd, args)
}

export async function tagDelete(cwd: string, name: string): Promise<GitOpResult> {
  if (!safeRef(name)) return { ok: false, error: 'invalid tag name' }
  return runOk(cwd, ['tag', '-d', name])
}

export async function stashPush(cwd: string, message?: string): Promise<GitOpResult> {
  const args = ['stash', 'push']
  if (message) args.push('-m', message)
  return runOk(cwd, args)
}

export async function stashPop(cwd: string, index?: number): Promise<GitOpResult> {
  const args = ['stash', 'pop']
  if (typeof index === 'number' && index >= 0) args.push(`stash@{${index}}`)
  return runOk(cwd, args)
}

export async function stashDrop(cwd: string, index: number): Promise<GitOpResult> {
  if (typeof index !== 'number' || index < 0) return { ok: false, error: 'invalid stash index' }
  return runOk(cwd, ['stash', 'drop', `stash@{${index}}`])
}

export async function stashApply(cwd: string, index: number): Promise<GitOpResult> {
  if (typeof index !== 'number' || index < 0) return { ok: false, error: 'invalid stash index' }
  return runOk(cwd, ['stash', 'apply', `stash@{${index}}`])
}

export function watchHead(cwd: string, onChange: () => void): () => void {
  const watchers: FSWatcher[] = []
  const gitDir = join(cwd, '.git')
  const debounced = debounce(onChange, 200)
  try {
    watchers.push(watch(join(gitDir, 'HEAD'), debounced))
  } catch {}
  try {
    watchers.push(watch(join(gitDir, 'refs'), { recursive: true }, debounced))
  } catch {
    try {
      watchers.push(watch(join(gitDir, 'refs'), debounced))
    } catch {}
  }
  return () => {
    for (const w of watchers) {
      try { w.close() } catch {}
    }
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}
