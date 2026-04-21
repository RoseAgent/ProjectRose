import { create } from 'zustand'
import type {
  GitBranch,
  GitCommit,
  GitCommitDetail,
  GitRemote,
  GitStash,
  GitStatus,
  GitTag,
  GitOpResult
} from '../types/electron'

type LeftTab = 'history' | 'branches' | 'tags' | 'stashes'

interface SelectedFileState {
  path: string
  oldContent: string
  newContent: string
  binary?: boolean
  source: 'commit' | 'working' | 'staged'
}

interface GitState {
  cwd: string | null
  isRepo: boolean
  leftTab: LeftTab

  status: GitStatus
  branches: GitBranch[]
  remotes: GitRemote[]
  tags: GitTag[]
  stashes: GitStash[]

  log: GitCommit[]
  logHasMore: boolean
  logLoading: boolean

  selectedSha: string | null
  selectedCommit: GitCommitDetail | null
  selectedFile: SelectedFileState | null

  commitMessage: string
  amend: boolean
  stagingCollapsed: boolean

  isOperating: boolean
  error: string | null
  lastOpMessage: string | null

  setCwd: (cwd: string | null) => void
  setLeftTab: (t: LeftTab) => void
  setCommitMessage: (m: string) => void
  setAmend: (a: boolean) => void
  toggleStagingCollapsed: () => void
  clearError: () => void

  refreshAll: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshBranches: () => Promise<void>
  refreshTags: () => Promise<void>
  refreshStashes: () => Promise<void>
  refreshRemotes: () => Promise<void>
  refreshLog: () => Promise<void>
  loadMoreLog: () => Promise<void>

  selectCommit: (sha: string | null) => Promise<void>
  selectCommitFile: (path: string) => Promise<void>
  selectWorkingFile: (path: string, staged: boolean) => Promise<void>

  stagePaths: (paths: string[]) => Promise<void>
  unstagePaths: (paths: string[]) => Promise<void>
  discardPaths: (paths: string[]) => Promise<void>
  commit: (allowEmpty?: boolean) => Promise<void>
  prefillAmendMessage: () => Promise<void>

  checkout: (ref: string) => Promise<void>
  branchCreate: (name: string, startPoint?: string) => Promise<void>
  branchDelete: (name: string, force?: boolean) => Promise<void>
  branchRename: (oldName: string, newName: string) => Promise<void>

  fetch: (remote?: string) => Promise<void>
  pull: (remote?: string, branch?: string) => Promise<void>
  push: (remote?: string, branch?: string, force?: boolean) => Promise<void>

  merge: (ref: string) => Promise<void>
  rebase: (ref: string) => Promise<void>
  reset: (target: string, mode: 'soft' | 'mixed' | 'hard') => Promise<void>
  cherryPick: (sha: string) => Promise<void>
  revert: (sha: string) => Promise<void>

  tagCreate: (name: string, ref?: string, message?: string) => Promise<void>
  tagDelete: (name: string) => Promise<void>

  stashPush: (message?: string) => Promise<void>
  stashPop: (index?: number) => Promise<void>
  stashApply: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>

  subscribeToWatchers: () => () => void
}

const EMPTY_STATUS: GitStatus = {
  currentBranch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: []
}

const LOG_PAGE_SIZE = 100

export const useGitStore = create<GitState>()((set, get) => ({
  cwd: null,
  isRepo: false,
  leftTab: 'history',

  status: EMPTY_STATUS,
  branches: [],
  remotes: [],
  tags: [],
  stashes: [],

  log: [],
  logHasMore: false,
  logLoading: false,

  selectedSha: null,
  selectedCommit: null,
  selectedFile: null,

  commitMessage: '',
  amend: false,
  stagingCollapsed: false,

  isOperating: false,
  error: null,
  lastOpMessage: null,

  setCwd: (cwd) => {
    const prev = get().cwd
    if (prev === cwd) return
    set({
      cwd,
      isRepo: false,
      status: EMPTY_STATUS,
      branches: [],
      remotes: [],
      tags: [],
      stashes: [],
      log: [],
      logHasMore: false,
      selectedSha: null,
      selectedCommit: null,
      selectedFile: null,
      commitMessage: '',
      amend: false,
      error: null
    })
  },

  setLeftTab: (t) => set({ leftTab: t }),
  setCommitMessage: (m) => set({ commitMessage: m }),
  setAmend: (a) => set({ amend: a }),
  toggleStagingCollapsed: () => set((s) => ({ stagingCollapsed: !s.stagingCollapsed })),
  clearError: () => set({ error: null, lastOpMessage: null }),

  refreshAll: async () => {
    const { cwd } = get()
    if (!cwd) return
    const isRepoRes = await window.api.git.isRepo(cwd)
    set({ isRepo: isRepoRes })
    if (!isRepoRes) return
    await Promise.all([
      get().refreshStatus(),
      get().refreshBranches(),
      get().refreshTags(),
      get().refreshStashes(),
      get().refreshRemotes(),
      get().refreshLog()
    ])
  },

  refreshStatus: async () => {
    const { cwd } = get()
    if (!cwd) return
    try {
      const s = (await window.api.git.status(cwd)) as GitStatus
      if (s) set({ status: s })
    } catch (e) {
      set({ error: String(e) })
    }
  },

  refreshBranches: async () => {
    const { cwd } = get()
    if (!cwd) return
    const b = (await window.api.git.branches(cwd)) as GitBranch[]
    set({ branches: b || [] })
  },

  refreshTags: async () => {
    const { cwd } = get()
    if (!cwd) return
    const t = (await window.api.git.tags(cwd)) as GitTag[]
    set({ tags: t || [] })
  },

  refreshStashes: async () => {
    const { cwd } = get()
    if (!cwd) return
    const s = (await window.api.git.stashes(cwd)) as GitStash[]
    set({ stashes: s || [] })
  },

  refreshRemotes: async () => {
    const { cwd } = get()
    if (!cwd) return
    const r = (await window.api.git.remotes(cwd)) as GitRemote[]
    set({ remotes: r || [] })
  },

  refreshLog: async () => {
    const { cwd } = get()
    if (!cwd) return
    set({ logLoading: true })
    const entries = (await window.api.git.log(cwd, { limit: LOG_PAGE_SIZE, skip: 0 })) as GitCommit[]
    set({
      log: entries || [],
      logHasMore: (entries || []).length === LOG_PAGE_SIZE,
      logLoading: false
    })
  },

  loadMoreLog: async () => {
    const { cwd, log, logLoading, logHasMore } = get()
    if (!cwd || logLoading || !logHasMore) return
    set({ logLoading: true })
    const entries = (await window.api.git.log(cwd, { limit: LOG_PAGE_SIZE, skip: log.length })) as GitCommit[]
    set({
      log: [...log, ...(entries || [])],
      logHasMore: (entries || []).length === LOG_PAGE_SIZE,
      logLoading: false
    })
  },

  selectCommit: async (sha) => {
    const { cwd } = get()
    if (!cwd || !sha) {
      set({ selectedSha: null, selectedCommit: null, selectedFile: null })
      return
    }
    set({ selectedSha: sha, selectedFile: null })
    try {
      const detail = (await window.api.git.show(cwd, sha)) as GitCommitDetail
      set({ selectedCommit: detail })
    } catch (e) {
      set({ error: String(e) })
    }
  },

  selectCommitFile: async (path) => {
    const { cwd, selectedSha } = get()
    if (!cwd || !selectedSha) return
    const res = await window.api.git.diffFile(cwd, { sha: selectedSha, path })
    set({
      selectedFile: {
        path,
        oldContent: res.oldContent,
        newContent: res.newContent,
        binary: res.binary,
        source: 'commit'
      }
    })
  },

  selectWorkingFile: async (path, staged) => {
    const { cwd } = get()
    if (!cwd) return
    const res = await window.api.git.diffWorking(cwd, { path, staged })
    set({
      selectedFile: {
        path,
        oldContent: res.oldContent,
        newContent: res.newContent,
        binary: res.binary,
        source: staged ? 'staged' : 'working'
      }
    })
  },

  stagePaths: async (paths) => runOp(get, set, () => window.api.git.stage(get().cwd!, paths), { refreshStatus: true }),
  unstagePaths: async (paths) => runOp(get, set, () => window.api.git.unstage(get().cwd!, paths), { refreshStatus: true }),
  discardPaths: async (paths) => runOp(get, set, () => window.api.git.discard(get().cwd!, paths), { refreshStatus: true }),

  commit: async (allowEmpty) => {
    const { cwd, commitMessage, amend } = get()
    if (!cwd) return
    await runOp(
      get,
      set,
      () => window.api.git.commit(cwd, { message: commitMessage, amend, allowEmpty }),
      { refreshAll: true }
    )
    if (!get().error) {
      set({ commitMessage: '', amend: false })
    }
  },

  prefillAmendMessage: async () => {
    const { cwd } = get()
    if (!cwd) return
    try {
      const commits = (await window.api.git.log(cwd, { limit: 1 })) as GitCommit[]
      const head = commits?.[0]
      if (head) {
        const msg = head.body ? `${head.subject}\n\n${head.body}` : head.subject
        set({ commitMessage: msg })
      }
    } catch {}
  },

  checkout: async (ref) => runOp(get, set, () => window.api.git.checkout(get().cwd!, ref), { refreshAll: true }),
  branchCreate: async (name, startPoint) => runOp(get, set, () => window.api.git.branchCreate(get().cwd!, { name, startPoint }), { refreshBranches: true }),
  branchDelete: async (name, force) => runOp(get, set, () => window.api.git.branchDelete(get().cwd!, { name, force }), { refreshBranches: true }),
  branchRename: async (oldName, newName) => runOp(get, set, () => window.api.git.branchRename(get().cwd!, { oldName, newName }), { refreshBranches: true }),

  fetch: async (remote) => runOp(get, set, () => window.api.git.fetch(get().cwd!, remote), { refreshAll: true }),
  pull: async (remote, branch) => runOp(get, set, () => window.api.git.pull(get().cwd!, { remote, branch }), { refreshAll: true }),
  push: async (remote, branch, force) => runOp(get, set, () => window.api.git.push(get().cwd!, { remote, branch, force }), { refreshBranches: true }),

  merge: async (ref) => runOp(get, set, () => window.api.git.merge(get().cwd!, ref), { refreshAll: true }),
  rebase: async (ref) => runOp(get, set, () => window.api.git.rebase(get().cwd!, ref), { refreshAll: true }),
  reset: async (target, mode) => runOp(get, set, () => window.api.git.reset(get().cwd!, { target, mode }), { refreshAll: true }),
  cherryPick: async (sha) => runOp(get, set, () => window.api.git.cherryPick(get().cwd!, sha), { refreshAll: true }),
  revert: async (sha) => runOp(get, set, () => window.api.git.revert(get().cwd!, sha), { refreshAll: true }),

  tagCreate: async (name, ref, message) => runOp(get, set, () => window.api.git.tagCreate(get().cwd!, { name, ref, message }), { refreshTags: true }),
  tagDelete: async (name) => runOp(get, set, () => window.api.git.tagDelete(get().cwd!, name), { refreshTags: true }),

  stashPush: async (message) => runOp(get, set, () => window.api.git.stashPush(get().cwd!, message), { refreshAll: true }),
  stashPop: async (index) => runOp(get, set, () => window.api.git.stashPop(get().cwd!, index), { refreshAll: true }),
  stashApply: async (index) => runOp(get, set, () => window.api.git.stashApply(get().cwd!, index), { refreshStatus: true }),
  stashDrop: async (index) => runOp(get, set, () => window.api.git.stashDrop(get().cwd!, index), { refreshStashes: true }),

  subscribeToWatchers: () => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleStatus = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void get().refreshStatus()
      }, 500)
    }
    const cleanupFile = window.api.onFileChange((_event, path) => {
      if (typeof path === 'string' && /(?:^|[\\/])\.git(?:[\\/]|$)/.test(path)) {
        // Ignore .git internals; HEAD watcher handles ref changes.
        return
      }
      scheduleStatus()
    })
    const cleanupHead = window.api.git.onHeadChanged(({ cwd }) => {
      if (cwd === get().cwd) void get().refreshAll()
    })
    return () => {
      if (timer) clearTimeout(timer)
      cleanupFile()
      cleanupHead()
    }
  }
}))

async function runOp(
  get: () => GitState,
  set: (u: Partial<GitState>) => void,
  fn: () => Promise<GitOpResult>,
  refresh: {
    refreshAll?: boolean
    refreshStatus?: boolean
    refreshBranches?: boolean
    refreshTags?: boolean
    refreshStashes?: boolean
  }
): Promise<void> {
  const cwd = get().cwd
  if (!cwd) return
  set({ isOperating: true, error: null, lastOpMessage: null })
  try {
    const res = await fn()
    if (!res.ok) {
      set({ error: res.error || 'operation failed', isOperating: false })
      return
    }
    set({ isOperating: false, lastOpMessage: 'ok' })
  } catch (e) {
    set({ error: String(e), isOperating: false })
    return
  }
  if (refresh.refreshAll) await get().refreshAll()
  else {
    const tasks: Promise<void>[] = []
    if (refresh.refreshStatus) tasks.push(get().refreshStatus())
    if (refresh.refreshBranches) tasks.push(get().refreshBranches())
    if (refresh.refreshTags) tasks.push(get().refreshTags())
    if (refresh.refreshStashes) tasks.push(get().refreshStashes())
    await Promise.all(tasks)
  }
}
