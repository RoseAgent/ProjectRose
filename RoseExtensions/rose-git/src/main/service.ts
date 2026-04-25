import { spawn } from 'child_process'

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

function git(
  cwd: string,
  args: string[],
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const proc = spawn('git', args, { cwd, windowsHide: true })

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try { proc.kill() } catch {}
        resolve({ stdout, stderr, code: -1 })
      }
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr, code: code ?? 0 })
      }
    })

    proc.on('error', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr, code: -1 })
      }
    })
  })
}

export async function isRepo(cwd: string): Promise<{ isRepo: boolean }> {
  const r = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  return { isRepo: r.code === 0 }
}

function parseStatusLine(line: string): GitFileChange | null {
  if (line.length < 3) return null
  const xy = line.slice(0, 2)
  const rest = line.slice(3)
  const x = xy[0]
  const y = xy[1]

  // Conflict states
  if ((x === 'U' || y === 'U') || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return { status: 'U', path: rest }
  }

  // Rename/copy in index
  if (x === 'R' || x === 'C') {
    const parts = rest.split('\0')
    const newPath = parts[0]
    const oldPath = parts[1] || newPath
    return { status: x as 'R' | 'C', path: newPath, oldPath }
  }

  if (x === '?' && y === '?') {
    return { status: '?', path: rest }
  }

  if (x !== ' ' && x !== '?') {
    const status = x as GitFileChange['status']
    return { status, path: rest }
  }

  if (y !== ' ' && y !== '?') {
    const status = y as GitFileChange['status']
    return { status, path: rest }
  }

  return null
}

export async function status(cwd: string): Promise<GitStatus> {
  const [statusResult, branchResult] = await Promise.all([
    git(cwd, ['status', '--porcelain=v1', '-uall', '-z']),
    git(cwd, ['status', '--branch', '--porcelain=v2', '-z'])
  ])

  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []
  const untracked: GitFileChange[] = []
  const conflicted: GitFileChange[] = []

  // Parse porcelain v1 output (null-separated)
  const entries = statusResult.stdout.split('\0').filter(Boolean)
  let i = 0
  while (i < entries.length) {
    const entry = entries[i]
    if (entry.length < 3) { i++; continue }
    const xy = entry.slice(0, 2)
    const path = entry.slice(3)
    const x = xy[0]
    const y = xy[1]

    // Conflict
    if ((x === 'U' || y === 'U') || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      conflicted.push({ status: 'U', path })
      i++
      continue
    }

    // Untracked
    if (x === '?' && y === '?') {
      untracked.push({ status: '?', path })
      i++
      continue
    }

    // Staged changes
    if (x !== ' ' && x !== '?') {
      if (x === 'R' || x === 'C') {
        const oldPath = entries[i + 1] || path
        staged.push({ status: x as 'R' | 'C', path, oldPath })
        i += 2
        continue
      }
      staged.push({ status: x as GitFileChange['status'], path })
    }

    // Unstaged changes
    if (y !== ' ' && y !== '?') {
      unstaged.push({ status: y as GitFileChange['status'], path })
    }

    i++
  }

  // Parse branch info from porcelain v2
  let currentBranch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0

  for (const line of branchResult.stdout.split('\0')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      currentBranch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const ab = line.slice('# branch.ab '.length).trim()
      const m = ab.match(/\+(\d+)\s+-(\d+)/)
      if (m) {
        ahead = parseInt(m[1], 10)
        behind = parseInt(m[2], 10)
      }
    }
  }

  return { currentBranch, upstream, ahead, behind, staged, unstaged, untracked, conflicted }
}

export async function log(
  cwd: string,
  limit: number,
  offset: number
): Promise<{ commits: GitCommit[]; hasMore: boolean }> {
  const SEP = '\x00'
  const REC = '\x01'
  const fmt = `%H${SEP}%h${SEP}%aN${SEP}%aE${SEP}%at${SEP}%P${SEP}%s${SEP}%b${REC}`
  const r = await git(cwd, [
    'log',
    `--pretty=format:${fmt}`,
    `-n`, String(limit + 1),
    `--skip`, String(offset)
  ])

  if (r.code !== 0) return { commits: [], hasMore: false }

  const records = r.stdout.split(REC).filter((s) => s.trim().length > 0)
  const hasMore = records.length > limit
  const sliced = records.slice(0, limit)

  const commits: GitCommit[] = sliced.map((rec) => {
    const parts = rec.split(SEP)
    return {
      sha: parts[0]?.trim() ?? '',
      shortSha: parts[1]?.trim() ?? '',
      authorName: parts[2]?.trim() ?? '',
      authorEmail: parts[3]?.trim() ?? '',
      timestamp: parseInt(parts[4]?.trim() ?? '0', 10),
      parents: (parts[5]?.trim() ?? '').split(' ').filter(Boolean),
      subject: parts[6]?.trim() ?? '',
      body: parts[7]?.trim() ?? ''
    }
  })

  return { commits, hasMore }
}

export async function commitDetail(cwd: string, sha: string): Promise<GitCommitDetail> {
  const SEP = '\x00'
  const fmt = `%H${SEP}%h${SEP}%aN${SEP}%aE${SEP}%at${SEP}%P${SEP}%s${SEP}%b`
  const [infoResult, filesResult] = await Promise.all([
    git(cwd, ['show', '--no-patch', `--pretty=format:${fmt}`, sha]),
    git(cwd, ['show', '--name-status', '--format=', sha])
  ])

  const parts = infoResult.stdout.split(SEP)
  const base: GitCommit = {
    sha: parts[0]?.trim() ?? sha,
    shortSha: parts[1]?.trim() ?? sha.slice(0, 7),
    authorName: parts[2]?.trim() ?? '',
    authorEmail: parts[3]?.trim() ?? '',
    timestamp: parseInt(parts[4]?.trim() ?? '0', 10),
    parents: (parts[5]?.trim() ?? '').split(' ').filter(Boolean),
    subject: parts[6]?.trim() ?? '',
    body: parts[7]?.trim() ?? ''
  }

  const files: GitFileChange[] = []
  for (const line of filesResult.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const status = trimmed[0] as GitFileChange['status']
    const rest = trimmed.slice(1).trim()
    if (status === 'R' || status === 'C') {
      const tabIdx = rest.indexOf('\t')
      if (tabIdx !== -1) {
        files.push({ status, path: rest.slice(tabIdx + 1), oldPath: rest.slice(0, tabIdx) })
      } else {
        files.push({ status, path: rest })
      }
    } else if (rest) {
      files.push({ status, path: rest })
    }
  }

  return { ...base, files }
}

export async function commitFileDiff(
  cwd: string,
  sha: string,
  path: string
): Promise<{ oldContent: string; newContent: string; binary: boolean }> {
  // Check if binary
  const numstat = await git(cwd, ['show', '--numstat', '--format=', sha, '--', path])
  const binary = numstat.stdout.trim().startsWith('-\t-')

  if (binary) return { oldContent: '', newContent: '', binary: true }

  const parent = `${sha}~1`
  const [oldResult, newResult] = await Promise.all([
    git(cwd, ['show', `${parent}:${path}`]).catch(() => ({ stdout: '', stderr: '', code: 0 })),
    git(cwd, ['show', `${sha}:${path}`]).catch(() => ({ stdout: '', stderr: '', code: 0 }))
  ])

  return {
    oldContent: oldResult.stdout,
    newContent: newResult.stdout,
    binary: false
  }
}

export async function fileDiff(
  cwd: string,
  path: string,
  staged: boolean
): Promise<{ oldContent: string; newContent: string; binary: boolean }> {
  // Check if binary
  const args = staged
    ? ['diff', '--numstat', '--cached', '--', path]
    : ['diff', '--numstat', '--', path]
  const numstat = await git(cwd, args)
  const binary = numstat.stdout.trim().startsWith('-\t-')

  if (binary) return { oldContent: '', newContent: '', binary: true }

  if (staged) {
    // old = HEAD:<path>, new = index:<path>
    const [oldResult, newResult] = await Promise.all([
      git(cwd, ['show', `HEAD:${path}`]).catch(() => ({ stdout: '', stderr: '', code: 0 })),
      git(cwd, ['show', `:${path}`]).catch(() => ({ stdout: '', stderr: '', code: 0 }))
    ])
    return { oldContent: oldResult.stdout, newContent: newResult.stdout, binary: false }
  } else {
    // old = index (or HEAD if not staged), new = working tree
    const [oldResult, newResult] = await Promise.all([
      git(cwd, ['show', `:${path}`])
        .then((r) => (r.code === 0 ? r : git(cwd, ['show', `HEAD:${path}`])))
        .catch(() => ({ stdout: '', stderr: '', code: 0 })),
      (async () => {
        const fs = await import('fs/promises')
        const p = await import('path')
        try {
          const content = await fs.readFile(p.join(cwd, path), 'utf8')
          return { stdout: content, stderr: '', code: 0 }
        } catch {
          return { stdout: '', stderr: '', code: 1 }
        }
      })()
    ])
    return { oldContent: oldResult.stdout, newContent: newResult.stdout, binary: false }
  }
}

export async function branches(cwd: string): Promise<GitBranch[]> {
  const r = await git(cwd, [
    'branch', '-a', '-v',
    '--format=%(refname:short)\t%(objectname:short)\t%(HEAD)\t%(upstream:short)\t%(creatordate:unix)'
  ])

  if (r.code !== 0) return []

  const result: GitBranch[] = []
  for (const line of r.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split('\t')
    const name = parts[0] ?? ''
    const sha = parts[1] ?? ''
    const isCurrent = parts[2] === '*'
    const upstream = parts[3] || undefined
    const lastCommitDate = parts[4] || undefined
    const isRemote = name.startsWith('remotes/')
    result.push({
      name: isRemote ? name.slice('remotes/'.length) : name,
      isCurrent,
      isRemote,
      upstream,
      sha,
      lastCommitDate
    })
  }

  return result
}

export async function remotes(cwd: string): Promise<GitRemote[]> {
  const r = await git(cwd, ['remote', '-v'])
  if (r.code !== 0) return []

  const seen = new Set<string>()
  const result: GitRemote[] = []
  for (const line of r.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('\t')) continue
    const [name, rest] = trimmed.split('\t')
    if (seen.has(name)) continue
    seen.add(name)
    const url = rest.replace(/\s+\(fetch\)|\s+\(push\)/g, '').trim()
    result.push({ name, url })
  }

  return result
}

export async function tags(cwd: string): Promise<GitTag[]> {
  const r = await git(cwd, ['tag', '-l', '--format=%(refname:short)\t%(objectname:short)'])
  if (r.code !== 0) return []

  const result: GitTag[] = []
  for (const line of r.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [name, sha] = trimmed.split('\t')
    result.push({ name: name ?? '', sha: sha ?? '' })
  }

  return result
}

export async function stashes(cwd: string): Promise<GitStash[]> {
  const r = await git(cwd, ['stash', 'list', '--format=%gd\t%H\t%s'])
  if (r.code !== 0) return []

  const result: GitStash[] = []
  for (const line of r.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [ref, sha, ...msgParts] = trimmed.split('\t')
    const m = ref?.match(/stash@\{(\d+)\}/)
    const index = m ? parseInt(m[1], 10) : 0
    result.push({ index, message: msgParts.join('\t') ?? '', sha: sha ?? '' })
  }

  return result
}

export async function fetch(cwd: string): Promise<GitOpResult> {
  const r = await git(cwd, ['fetch', '--all', '--prune'], 60_000)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function pull(cwd: string): Promise<GitOpResult> {
  const r = await git(cwd, ['pull'], 60_000)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function push(
  cwd: string,
  remote?: string,
  branch?: string,
  forceWithLease?: boolean
): Promise<GitOpResult> {
  const args = ['push']
  if (forceWithLease) args.push('--force-with-lease')
  if (remote) args.push(remote)
  if (branch) args.push(branch)
  const r = await git(cwd, args, 60_000)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function checkout(cwd: string, name: string): Promise<GitOpResult> {
  const r = await git(cwd, ['checkout', name])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function branchCreate(
  cwd: string,
  name: string,
  startPoint?: string
): Promise<GitOpResult> {
  const args = ['checkout', '-b', name]
  if (startPoint) args.push(startPoint)
  const r = await git(cwd, args)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function branchDelete(
  cwd: string,
  name: string,
  force: boolean
): Promise<GitOpResult> {
  const args = ['branch', force ? '-D' : '-d', name]
  const r = await git(cwd, args)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function branchRename(
  cwd: string,
  oldName: string,
  newName: string
): Promise<GitOpResult> {
  const r = await git(cwd, ['branch', '-m', oldName, newName])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function merge(cwd: string, name: string): Promise<GitOpResult> {
  const r = await git(cwd, ['merge', name])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function rebase(cwd: string, name: string): Promise<GitOpResult> {
  const r = await git(cwd, ['rebase', name])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function cherryPick(cwd: string, sha: string): Promise<GitOpResult> {
  const r = await git(cwd, ['cherry-pick', sha])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function revert(cwd: string, sha: string): Promise<GitOpResult> {
  const r = await git(cwd, ['revert', '--no-edit', sha])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function reset(
  cwd: string,
  target: string,
  mode: 'soft' | 'mixed' | 'hard'
): Promise<GitOpResult> {
  const r = await git(cwd, ['reset', `--${mode}`, target])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function tagCreate(
  cwd: string,
  name: string,
  sha?: string,
  annotation?: string
): Promise<GitOpResult> {
  const args: string[] = annotation
    ? ['tag', '-a', name, '-m', annotation]
    : ['tag', name]
  if (sha) args.push(sha)
  const r = await git(cwd, args)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function tagDelete(cwd: string, name: string): Promise<GitOpResult> {
  const r = await git(cwd, ['tag', '-d', name])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function stashPush(cwd: string, message?: string): Promise<GitOpResult> {
  const args = ['stash', 'push']
  if (message) args.push('-m', message)
  const r = await git(cwd, args)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function stashPop(cwd: string, index: number): Promise<GitOpResult> {
  const r = await git(cwd, ['stash', 'pop', `stash@{${index}}`])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function stashApply(cwd: string, index: number): Promise<GitOpResult> {
  const r = await git(cwd, ['stash', 'apply', `stash@{${index}}`])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function stashDrop(cwd: string, index: number): Promise<GitOpResult> {
  const r = await git(cwd, ['stash', 'drop', `stash@{${index}}`])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function stagePaths(cwd: string, paths: string[]): Promise<GitOpResult> {
  const r = await git(cwd, ['add', '--', ...paths])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function unstagePaths(cwd: string, paths: string[]): Promise<GitOpResult> {
  const r = await git(cwd, ['reset', 'HEAD', '--', ...paths])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function discardPaths(cwd: string, paths: string[]): Promise<GitOpResult> {
  const r = await git(cwd, ['checkout', '--', ...paths])
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function commit(
  cwd: string,
  message: string,
  amend: boolean
): Promise<GitOpResult> {
  const args = ['commit', '-m', message]
  if (amend) args.push('--amend')
  const r = await git(cwd, args)
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.trim() || r.stdout.trim() }
}

export async function getLastCommitMessage(cwd: string): Promise<{ message: string }> {
  const r = await git(cwd, ['log', '-1', '--pretty=format:%B'])
  return { message: r.code === 0 ? r.stdout.trim() : '' }
}
