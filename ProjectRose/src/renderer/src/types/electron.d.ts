import type { FileNode } from '@shared/types'

export interface SpamRule {
  id: string
  type: 'sender' | 'domain' | 'subject'
  value: string
  enabled: boolean
}

export interface InjectionPattern {
  id: string
  pattern: string
  isRegex: boolean
  enabled: boolean
  builtin: boolean
}

export interface EmailFilters {
  spamRules: SpamRule[]
  injectionPatterns: InjectionPattern[]
  customFolders: Array<{ id: string; name: string }>
}

export interface EmailMessageMeta {
  folder: string
  spamClassified: boolean
  injectionDetected: boolean
}

export interface ModelConfig {
  id: string
  displayName: string
  provider: 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'bedrock'
  modelName: string
  baseUrl: string
  tags: string[]
}

export interface RouterConfig {
  enabled: boolean
  modelName: string
  baseUrl: string
}

export interface CompressionConfig {
  provider: 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'bedrock'
  modelName: string
  baseUrl: string
}

export interface DiscordChannel {
  id: string
  name: string
  guildId: string
  guildName: string
  type: number
}

export interface DiscordAttachment {
  id: string
  filename: string
  url: string
  size: number
  contentType?: string
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  image?: { url: string }
  thumbnail?: { url: string }
  footer?: { text: string }
}

export interface DiscordReaction {
  emoji: string
  count: number
}

export interface DiscordMessage {
  id: string
  channelId: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
  avatarUrl: string | null
  content: string
  timestamp: string
  editedTimestamp: string | null
  attachments: DiscordAttachment[]
  embeds: DiscordEmbed[]
  reactions: DiscordReaction[]
  referencedMessageId: string | null
}

export interface DiscordAPI {
  connect: () => Promise<{ ok: boolean; error?: string }>
  disconnect: () => Promise<void>
  getChannels: () => Promise<DiscordChannel[]>
  fetchMessages: (channelId: string, limit: number, beforeId?: string) => Promise<DiscordMessage[]>
  sendMessage: (channelId: string, content: string) => Promise<DiscordMessage>
  onMessageCreate: (callback: (msg: DiscordMessage) => void) => () => void
  onConnectionState: (callback: (state: { connected: boolean }) => void) => () => void
}

export interface AppSettingsData {
  heartbeatEnabled: boolean
  heartbeatIntervalMinutes: number
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
  imapHost: string
  imapPort: number
  imapUser: string
  imapPassword: string
  imapTLS: boolean
  discordBotToken: string
  discordChannels: string[]
  models: ModelConfig[]
  defaultModelId: string
  providerKeys: { anthropic: string; openai: string; bedrock: { region: string; accessKeyId: string; secretAccessKey: string } }
  router: RouterConfig
  compression: CompressionConfig
}
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

export interface ToolMeta {
  name: string
  displayName: string
  description: string
  type: 'core' | 'python'
}

export interface ProjectSettings {
  disabledTools: string[]
}

export interface ElectronAPI {
  // AI
  aiChat: (messages: { role: string; content: string }[], rootPath: string) => Promise<{ content: string; modifiedFiles: string[]; modelDisplay: string }>
  aiCompress: (messages: { role: string; content: string }[]) => Promise<{ role: string; content: string }[]>
  onAiFileModified: (callback: (data: { path: string }) => void) => () => void
  onAiToolCallStart: (callback: (data: { id: string; name: string; params: Record<string, unknown> }) => void) => () => void
  onAiToolCallEnd: (callback: (data: { id: string; result: string; error: boolean }) => void) => () => void
  onAiThinking: (callback: (data: { content: string }) => void) => () => void
  onAiToken: (callback: (data: { token: string }) => void) => () => void
  onAiModelSelected: (callback: (data: { modelDisplay: string }) => void) => () => void
  onAiStreamReset: (callback: (data: { errorMessage: string; fallbackModel: string }) => void) => () => void

  // Theme
  setNativeTheme: (theme: 'dark' | 'light' | 'herbarium') => void

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

  // Settings
  getSettings: (rootPath?: string) => Promise<AppSettingsData>
  setSettings: (patch: Partial<AppSettingsData>, rootPath?: string) => Promise<AppSettingsData>
  checkServicesHealth: () => Promise<Array<{ name: string; url: string; status: 'up' | 'down'; latency?: number }>>
  transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<string>

  // Indexing / LSP startup
  indexProject: (rootPath: string) => Promise<IndexingResult>
  onIndexingProgress: (callback: (progress: IndexingProgress) => void) => () => void

  // LSP bridge
  lsp: {
    sendToServer: (server: 'py' | 'ts', msg: object) => void
    onMessage: (server: 'py' | 'ts', callback: (msg: unknown) => void) => () => void
    onStarted: (callback: (status: { py: boolean; ts: boolean }) => void) => () => void
    onStopped: (callback: () => void) => () => void
  }

  // Tools + Project settings
  tools: {
    list: (rootPath: string) => Promise<ToolMeta[]>
  }
  project: {
    getSettings: (rootPath: string) => Promise<ProjectSettings>
    setSettings: (rootPath: string, patch: Partial<ProjectSettings>) => Promise<ProjectSettings>
  }

  // Chat Sessions
  session: SessionAPI

  // Email
  email: EmailAPI

  // Discord
  discord: DiscordAPI

  // Docker
  docker: DockerAPI

  // Git
  git: GitAPI

  // Extensions
  extension: ExtensionAPI

  // Active Listening / RoseSpeech
  activeSpeech: ActiveSpeechAPI
}

export interface ChatSessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ChatSession extends ChatSessionMeta {
  messages: unknown[]
}

export interface SessionAPI {
  list: (rootPath: string) => Promise<ChatSessionMeta[]>
  load: (rootPath: string, sessionId: string) => Promise<ChatSession | null>
  save: (rootPath: string, session: ChatSession) => Promise<void>
  delete: (rootPath: string, sessionId: string) => Promise<void>
}

export interface EmailMessage {
  uid: number
  subject: string
  from: string
  date: string
  read: boolean
  folder: string
  injectionDetected: boolean
}

export interface EmailAPI {
  testConnection: () => Promise<{ ok: boolean; error?: string }>
  fetchMessages: () => Promise<EmailMessage[]>
  fetchMessage: (uid: number) => Promise<string>
  deleteMessage: (uid: number) => Promise<{ ok: boolean; error?: string }>
  getFilters: () => Promise<EmailFilters>
  setFilters: (patch: Partial<EmailFilters>) => Promise<EmailFilters>
  getMeta: () => Promise<Record<string, EmailMessageMeta>>
  setMessageFolder: (uid: number, folder: string) => Promise<void>
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

export interface ExtensionAPI {
  list: () => Promise<{ installed: import('@shared/extension-types').InstalledExtension[] }>
  install: (downloadUrl: string, extensionId?: string) => Promise<{ ok: boolean }>
  uninstall: (id: string) => Promise<{ ok: boolean }>
  enable: (id: string) => Promise<{ ok: boolean }>
  disable: (id: string) => Promise<{ ok: boolean }>
  fetchRegistry: (registryUrl: string) => Promise<import('@shared/extension-types').ExtensionRegistry>
}

export interface ActiveSpeechAPI {
  getSpeakers: () => Promise<Array<{ id: number; name: string; created_at: string }>>
  createSpeaker: (name: string) => Promise<{ id: number; name: string }>
  addSample: (payload: { speakerId: number; source: string; audioBuffer: ArrayBuffer; projectId?: string }) => Promise<{ id: number }>
  labelSpeaker: (payload: { utteranceId: number; speakerId?: number; speakerName?: string }) => Promise<{ ok: boolean; speaker_id: number }>
  train: () => Promise<{ job_id: number }>
  trainStatus: (jobId: number) => Promise<{ status: string; accuracy: number | null; deployed: boolean; error: string | null }>
  trainHistory: () => Promise<Array<{ id: number; accuracy: number; is_active: boolean; trained_at: string; sample_count: number; notes: string | null }>>
  createSession: (projectId?: string) => Promise<{ id: number }>
  endSession: (sessionId: number) => Promise<{ ok: boolean }>
  getUtterances: (sessionId: number) => Promise<Array<{ id: number; text: string; speaker_name: string | null; speaker_id: number | null }>>
  getSessions: () => Promise<Array<{ id: number; project_id: string | null; started_at: string; ended_at: string | null }>>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
