import type { FileNode } from '@shared/types'
import type {
  HealthResponse,
  FileHashEntry,
  FileCheckResult,
  FileUpdateItem,
  BulkUpdateResponse,
  IndexStatus,
  SearchRequest,
  SearchResult,
  FindReferencesRequest,
  ReferenceResult
} from '@shared/roseLibraryTypes'

export interface IndexingProgress {
  phase: 'checking' | 'indexing' | 'done' | 'error'
  total: number
  completed: number
  message: string
}

export interface IndexingResult {
  indexed: number
  total: number
  error?: string
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: number
}

export interface ElectronAPI {
  // AI
  aiChat: (messages: { role: string; content: string }[], rootPath: string) => Promise<{ content: string; modifiedFiles: string[] }>
  aiCompress: (messages: { role: string; content: string }[]) => Promise<{ role: string; content: string }[]>
  onAiFileModified: (callback: (data: { path: string }) => void) => () => void
  onAiToolCallStart: (callback: (data: { id: string; name: string; params: Record<string, unknown> }) => void) => () => void
  onAiToolCallEnd: (callback: (data: { id: string; result: string; error: boolean }) => void) => () => void

  // Theme
  setNativeTheme: (theme: 'dark' | 'light') => void

  // Menu events
  onMenuNewFile: (callback: () => void) => () => void
  onMenuOpenFile: (callback: () => void) => () => void
  onMenuOpenFolder: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void

  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  readDirectoryTree: (dirPath: string) => Promise<FileNode>
  openFolderDialog: () => Promise<string | null>
  openFileDialog: () => Promise<string | null>
  saveFileDialog: (defaultPath?: string) => Promise<string | null>
  spawnTerminal: (config?: { cwd?: string }) => Promise<string>
  writeTerminal: (sessionId: string, data: string) => void
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  disposeTerminal: (sessionId: string) => Promise<void>
  onTerminalData: (callback: (data: string) => void) => () => void
  onTerminalExit: (callback: (code: number) => void) => () => void
  onFileChange: (callback: (event: string, path: string) => void) => () => void
  getRecentProjects: () => Promise<RecentProject[]>
  addRecentProject: (projectPath: string) => Promise<RecentProject[]>
  removeRecentProject: (projectPath: string) => Promise<RecentProject[]>
  getDefaultProjectPath: () => Promise<string>

  // Project setup
  checkRoseMd: (rootPath: string) => Promise<boolean>
  initProject: (payload: { rootPath: string; name: string; identity: string; autonomy: string }) => Promise<void>

  // Heartbeat
  runHeartbeat: (rootPath: string) => Promise<string>
  getHeartbeatLogs: (rootPath: string) => Promise<string[]>
  getHeartbeatLogContent: (rootPath: string, filename: string) => Promise<string>

  // Indexing
  indexProject: (rootPath: string) => Promise<IndexingResult>
  indexFile: (filePath: string, content: string, rootPath: string) => Promise<void>
  onIndexingProgress: (callback: (progress: IndexingProgress) => void) => () => void

  // RoseLibrary
  roseHealth: () => Promise<HealthResponse>
  roseCheckFiles: (files: FileHashEntry[]) => Promise<FileCheckResult[]>
  roseUpdateFiles: (files: FileUpdateItem[]) => Promise<BulkUpdateResponse>
  roseStatus: () => Promise<IndexStatus>
  roseSearch: (params: SearchRequest) => Promise<SearchResult[]>
  roseFindReferences: (params: FindReferencesRequest) => Promise<ReferenceResult[]>

  // Docker
  docker: DockerAPI

  // Git
  git: GitAPI
}

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

export interface DockerAPI {
  check: () => Promise<{ installed: boolean; version?: string }>
  listCompose: (rootPath: string) => Promise<string[]>
  ps: (composeFiles: string[]) => Promise<DockerContainer[]>
  inspect: (id: string) => Promise<unknown>
  start: (id: string) => Promise<{ ok: boolean; error?: string }>
  stop: (id: string) => Promise<{ ok: boolean; error?: string }>
  restart: (id: string) => Promise<{ ok: boolean; error?: string }>
  subscribeLogs: (id: string, opts?: { tail?: number }) => Promise<string>
  unsubscribeLogs: (sessionId: string) => Promise<void>
  onLogsData: (callback: (payload: { sessionId: string; chunk: string }) => void) => () => void
  onLogsExit: (callback: (payload: { sessionId: string; code: number }) => void) => () => void
  listFiles: (id: string, path: string) => Promise<{ entries: DockerDirEntry[] }>
  mounts: (id: string) => Promise<DockerMount[]>
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

export interface GitAPI {
  isRepo: (cwd: string) => Promise<boolean>
  status: (cwd: string) => Promise<GitStatus>
  log: (cwd: string, opts?: { limit?: number; skip?: number; ref?: string; filePath?: string }) => Promise<GitCommit[]>
  show: (cwd: string, sha: string) => Promise<GitCommitDetail>
  diffFile: (cwd: string, params: { sha: string; path: string }) => Promise<{ oldContent: string; newContent: string; binary?: boolean }>
  diffWorking: (cwd: string, params: { path: string; staged?: boolean }) => Promise<{ oldContent: string; newContent: string; binary?: boolean }>
  branches: (cwd: string) => Promise<GitBranch[]>
  checkout: (cwd: string, ref: string) => Promise<GitOpResult>
  branchCreate: (cwd: string, params: { name: string; startPoint?: string }) => Promise<GitOpResult>
  branchDelete: (cwd: string, params: { name: string; force?: boolean }) => Promise<GitOpResult>
  branchRename: (cwd: string, params: { oldName: string; newName: string }) => Promise<GitOpResult>
  remotes: (cwd: string) => Promise<GitRemote[]>
  fetch: (cwd: string, remote?: string) => Promise<GitOpResult>
  pull: (cwd: string, params?: { remote?: string; branch?: string }) => Promise<GitOpResult>
  push: (cwd: string, params?: { remote?: string; branch?: string; force?: boolean }) => Promise<GitOpResult>
  stage: (cwd: string, paths: string[]) => Promise<GitOpResult>
  unstage: (cwd: string, paths: string[]) => Promise<GitOpResult>
  discard: (cwd: string, paths: string[]) => Promise<GitOpResult>
  commit: (cwd: string, params: { message: string; amend?: boolean; allowEmpty?: boolean }) => Promise<GitOpResult>
  cherryPick: (cwd: string, sha: string) => Promise<GitOpResult>
  revert: (cwd: string, sha: string) => Promise<GitOpResult>
  merge: (cwd: string, ref: string) => Promise<GitOpResult>
  rebase: (cwd: string, ref: string) => Promise<GitOpResult>
  reset: (cwd: string, params: { target: string; mode: 'soft' | 'mixed' | 'hard' }) => Promise<GitOpResult>
  tags: (cwd: string) => Promise<GitTag[]>
  tagCreate: (cwd: string, params: { name: string; ref?: string; message?: string }) => Promise<GitOpResult>
  tagDelete: (cwd: string, name: string) => Promise<GitOpResult>
  stashes: (cwd: string) => Promise<GitStash[]>
  stashPush: (cwd: string, message?: string) => Promise<GitOpResult>
  stashPop: (cwd: string, index?: number) => Promise<GitOpResult>
  stashDrop: (cwd: string, index: number) => Promise<GitOpResult>
  stashApply: (cwd: string, index: number) => Promise<GitOpResult>
  onHeadChanged: (callback: (payload: { cwd: string }) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
