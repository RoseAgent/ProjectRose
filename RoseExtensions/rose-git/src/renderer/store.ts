import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Store State & Actions ───────────────────────────────────────────────────

const DEFAULT_STATUS: GitStatus = {
  currentBranch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: []
}

interface GitState {
  cwd: string | null
  isRepo: boolean
  status: GitStatus
  log: GitCommit[]
  logHasMore: boolean
  logLoading: boolean
  selectedSha: string | null
  selectedCommit: GitCommitDetail | null
  branches: GitBranch[]
  remotes: GitRemote[]
  tags: GitTag[]
  stashes: GitStash[]
  error: string | null
  isOperating: boolean
  leftTab: 'history' | 'branches' | 'tags' | 'stashes'
  stagingCollapsed: boolean
  commitMessage: string
  amend: boolean
  selectedFile: {
    path: string
    source: 'working' | 'staged' | 'commit'
    oldContent: string
    newContent: string
    binary: boolean
  } | null

  // Actions
  setCwd: (rootPath: string | null) => void
  refreshAll: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshBranches: () => Promise<void>
  refreshTags: () => Promise<void>
  refreshStashes: () => Promise<void>
  subscribeToWatchers: () => () => void
  selectCommit: (sha: string) => Promise<void>
  selectCommitFile: (path: string) => Promise<void>
  selectWorkingFile: (path: string, staged: boolean) => Promise<void>
  loadMoreLog: () => Promise<void>
  clearError: () => void
  toggleStagingCollapsed: () => void
  setLeftTab: (tab: 'history' | 'branches' | 'tags' | 'stashes') => void
  setCommitMessage: (msg: string) => void
  setAmend: (amend: boolean) => void
  prefillAmendMessage: () => Promise<void>
  fetch: () => Promise<void>
  pull: () => Promise<void>
  push: (remote?: string, branch?: string, forceWithLease?: boolean) => Promise<void>
  checkout: (name: string) => Promise<void>
  branchCreate: (name: string, startPoint?: string) => Promise<void>
  branchDelete: (name: string, force: boolean) => Promise<void>
  branchRename: (oldName: string, newName: string) => Promise<void>
  merge: (name: string) => Promise<void>
  rebase: (name: string) => Promise<void>
  cherryPick: (sha: string) => Promise<void>
  revert: (sha: string) => Promise<void>
  reset: (target: string, mode: 'soft' | 'mixed' | 'hard') => Promise<void>
  tagCreate: (name: string, sha?: string, annotation?: string) => Promise<void>
  tagDelete: (name: string) => Promise<void>
  stashPush: (message?: string) => Promise<void>
  stashPop: (index: number) => Promise<void>
  stashApply: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  stagePaths: (paths: string[]) => Promise<void>
  unstagePaths: (paths: string[]) => Promise<void>
  discardPaths: (paths: string[]) => Promise<void>
  commit: () => Promise<void>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  (window as any).api.invoke(channel, ...args) as Promise<T>

function handleOpResult(result: GitOpResult, set: (s: Partial<GitState>) => void): boolean {
  if (!result.ok) {
    set({ error: result.error ?? 'Operation failed', isOperating: false })
    return false
  }
  return true
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useGitStore = create<GitState>((set, get) => ({
  cwd: null,
  isRepo: false,
  status: { ...DEFAULT_STATUS },
  log: [],
  logHasMore: false,
  logLoading: false,
  selectedSha: null,
  selectedCommit: null,
  branches: [],
  remotes: [],
  tags: [],
  stashes: [],
  error: null,
  isOperating: false,
  leftTab: 'history',
  stagingCollapsed: false,
  commitMessage: '',
  amend: false,
  selectedFile: null,

  setCwd(rootPath) {
    if (rootPath === null) {
      set({ cwd: null, isRepo: false })
    } else {
      set({ cwd: rootPath })
    }
  },

  async refreshAll() {
    const { cwd } = get()
    if (!cwd) return

    const repoResult = await invoke<{ isRepo: boolean }>('rose-git:isRepo', cwd)
    if (!repoResult.isRepo) {
      set({ isRepo: false })
      return
    }

    set({ isRepo: true })

    const [statusResult, logResult, branchesResult, remotesResult, tagsResult, stashesResult] =
      await Promise.all([
        invoke<GitStatus>('rose-git:status', cwd).catch(() => DEFAULT_STATUS),
        invoke<{ commits: GitCommit[]; hasMore: boolean }>('rose-git:log', cwd, 50, 0).catch(() => ({ commits: [], hasMore: false })),
        invoke<GitBranch[]>('rose-git:branches', cwd).catch(() => []),
        invoke<GitRemote[]>('rose-git:remotes', cwd).catch(() => []),
        invoke<GitTag[]>('rose-git:tags', cwd).catch(() => []),
        invoke<GitStash[]>('rose-git:stashes', cwd).catch(() => [])
      ])

    set({
      status: statusResult,
      log: logResult.commits,
      logHasMore: logResult.hasMore,
      branches: branchesResult,
      remotes: remotesResult,
      tags: tagsResult,
      stashes: stashesResult
    })
  },

  async refreshStatus() {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitStatus>('rose-git:status', cwd).catch(() => DEFAULT_STATUS)
    set({ status: result })
  },

  async refreshBranches() {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitBranch[]>('rose-git:branches', cwd).catch(() => [])
    set({ branches: result })
  },

  async refreshTags() {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitTag[]>('rose-git:tags', cwd).catch(() => [])
    set({ tags: result })
  },

  async refreshStashes() {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitStash[]>('rose-git:stashes', cwd).catch(() => [])
    set({ stashes: result })
  },

  subscribeToWatchers() {
    const { cwd } = get()
    if (!cwd) return () => {}

    void invoke('rose-git:watchStart', cwd)

    const unsub = (window as any).api.on('rose-git:changed', () => {
      void get().refreshAll()
    })

    return () => {
      void invoke('rose-git:watchStop', cwd)
      if (typeof unsub === 'function') unsub()
    }
  },

  async selectCommit(sha) {
    set({ selectedSha: sha, selectedCommit: null, selectedFile: null })
    const { cwd } = get()
    if (!cwd) return
    const detail = await invoke<GitCommitDetail>('rose-git:commitDetail', cwd, sha).catch(() => null)
    if (detail) set({ selectedCommit: detail })
  },

  async selectCommitFile(path) {
    const { cwd, selectedSha } = get()
    if (!cwd || !selectedSha) return
    const result = await invoke<{ oldContent: string; newContent: string; binary: boolean }>(
      'rose-git:commitFileDiff', cwd, selectedSha, path
    ).catch(() => null)
    if (result) {
      set({ selectedFile: { path, source: 'commit', ...result } })
    }
  },

  async selectWorkingFile(path, staged) {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<{ oldContent: string; newContent: string; binary: boolean }>(
      'rose-git:fileDiff', cwd, path, staged
    ).catch(() => null)
    if (result) {
      set({ selectedFile: { path, source: staged ? 'staged' : 'working', ...result } })
    }
  },

  async loadMoreLog() {
    const { cwd, log, logLoading } = get()
    if (!cwd || logLoading) return
    set({ logLoading: true })
    const result = await invoke<{ commits: GitCommit[]; hasMore: boolean }>(
      'rose-git:log', cwd, 50, log.length
    ).catch(() => ({ commits: [], hasMore: false }))
    set({
      log: [...log, ...result.commits],
      logHasMore: result.hasMore,
      logLoading: false
    })
  },

  clearError() {
    set({ error: null })
  },

  toggleStagingCollapsed() {
    set((s) => ({ stagingCollapsed: !s.stagingCollapsed }))
  },

  setLeftTab(tab) {
    set({ leftTab: tab })
  },

  setCommitMessage(msg) {
    set({ commitMessage: msg })
  },

  setAmend(amend) {
    set({ amend })
  },

  async prefillAmendMessage() {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<{ message: string }>('rose-git:getLastCommitMessage', cwd).catch(() => null)
    if (result) set({ commitMessage: result.message })
  },

  async fetch() {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:fetch', cwd).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async pull() {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:pull', cwd).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async push(remote?, branch?, forceWithLease?) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:push', cwd, remote, branch, forceWithLease).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async checkout(name) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:checkout', cwd, name).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshBranches()
    }
  },

  async branchCreate(name, startPoint?) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:branchCreate', cwd, name, startPoint).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshBranches()
    }
  },

  async branchDelete(name, force) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:branchDelete', cwd, name, force).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshBranches()
    }
  },

  async branchRename(oldName, newName) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:branchRename', cwd, oldName, newName).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshBranches()
    }
  },

  async merge(name) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:merge', cwd, name).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async rebase(name) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:rebase', cwd, name).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async cherryPick(sha) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:cherryPick', cwd, sha).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async revert(sha) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:revert', cwd, sha).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async reset(target, mode) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:reset', cwd, target, mode).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshAll()
    }
  },

  async tagCreate(name, sha?, annotation?) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:tagCreate', cwd, name, sha, annotation).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshTags()
    }
  },

  async tagDelete(name) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:tagDelete', cwd, name).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshTags()
    }
  },

  async stashPush(message?) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:stashPush', cwd, message).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshStashes()
    }
  },

  async stashPop(index) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:stashPop', cwd, index).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshStashes()
    }
  },

  async stashApply(index) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:stashApply', cwd, index).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshStashes()
    }
  },

  async stashDrop(index) {
    const { cwd } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:stashDrop', cwd, index).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false })
      await get().refreshStashes()
    }
  },

  async stagePaths(paths) {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitOpResult>('rose-git:stagePaths', cwd, paths).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      await get().refreshStatus()
    }
  },

  async unstagePaths(paths) {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitOpResult>('rose-git:unstagePaths', cwd, paths).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      await get().refreshStatus()
    }
  },

  async discardPaths(paths) {
    const { cwd } = get()
    if (!cwd) return
    const result = await invoke<GitOpResult>('rose-git:discardPaths', cwd, paths).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      await get().refreshStatus()
    }
  },

  async commit() {
    const { cwd, commitMessage, amend } = get()
    if (!cwd) return
    set({ isOperating: true })
    const result = await invoke<GitOpResult>('rose-git:commit', cwd, commitMessage, amend).catch((e) => ({ ok: false, error: String(e) }))
    if (handleOpResult(result, set)) {
      set({ isOperating: false, commitMessage: '', amend: false })
      await get().refreshAll()
    }
  }
}))
