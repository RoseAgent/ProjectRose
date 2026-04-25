import type { FileNode } from '@shared/types'

export interface ModelConfig {
  id: string
  displayName: string
  provider: 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'bedrock' | 'projectrose'
  modelName: string
  baseUrl: string
  tags: string[]
}

export interface RouterConfig {
  enabled: boolean
  modelName: string
  baseUrl: string
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
  providerKeys: { anthropic: string; openai: string; bedrock: { region: string; accessKeyId: string; secretAccessKey: string }; projectrose: { accessToken: string; refreshToken: string; email: string; plan: string } | null }
  router: RouterConfig
  navItems: import('../../../shared/types').NavItem[]
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
  type: 'core' | 'python' | 'extension'
  extensionId?: string
  extensionName?: string
}

export interface ProjectSettings {
  disabledTools: string[]
}

export interface ElectronAPI {
  // AI
  aiChat: (messages: { role: string; content: string }[], rootPath: string, sessionId: string) => Promise<{ content: string; modifiedFiles: string[]; modelDisplay: string }>
  aiCompress: (messages: { role: string; content: string }[]) => Promise<{ role: string; content: string }[]>
  aiGetSystemPrompt: (rootPath: string) => Promise<string>
  onAiFileModified: (callback: (data: { path: string }) => void) => () => void
  onAiToolCallStart: (callback: (data: { id: string; name: string; params: Record<string, unknown> }) => void) => () => void
  onAiToolCallEnd: (callback: (data: { id: string; result: string; error: boolean }) => void) => () => void
  onAiThinking: (callback: (data: { content: string }) => void) => () => void
  onAiToken: (callback: (data: { token: string }) => void) => () => void
  onAiModelSelected: (callback: (data: { modelDisplay: string }) => void) => () => void
  onAiStreamReset: (callback: (data: { errorMessage: string; fallbackModel: string }) => void) => () => void
  aiCancelGeneration: () => Promise<void>
  onAiAskUser: (callback: (data: { questionId: string; question: string; options: string[] }) => void) => () => void
  aiAskUserResponse: (questionId: string, answer: string) => Promise<void>

  // Theme
  setNativeTheme: (theme: 'dark' | 'light' | 'herbarium') => void

  // Menu events
  onMenuNewFile: (callback: () => void) => () => void
  onMenuOpenFile: (callback: () => void) => () => void
  onMenuOpenFolder: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void

  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  createFile: (filePath: string) => Promise<void>
  deleteFile: (filePath: string) => Promise<void>
  deleteDirectory: (dirPath: string) => Promise<void>
  renameFile: (oldPath: string, newPath: string) => Promise<void>
  createDirectory: (dirPath: string) => Promise<void>
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
  ensureScaffold: (rootPath: string) => Promise<void>
  initProject: (payload: { rootPath: string; name: string; identity: string; autonomy: string; userName: string; commStyle: string; depth: string; proactivity: string }) => Promise<void>

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

  // Extensions
  extension: ExtensionAPI

  // Active Listening / RoseSpeech
  activeSpeech: ActiveSpeechAPI

  // Account auth
  auth: AuthAPI

  // Generic IPC bridge for extensions
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void

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

export interface ExtensionAPI {
  list: (rootPath: string) => Promise<{ installed: import('@shared/extension-types').InstalledExtension[] }>
  installFromDisk: (rootPath: string) => Promise<{ ok: boolean; canceled?: boolean }>
  uninstall: (rootPath: string, id: string) => Promise<{ ok: boolean }>
  enable: (rootPath: string, id: string) => Promise<{ ok: boolean }>
  disable: (rootPath: string, id: string) => Promise<{ ok: boolean }>
  loadRendererCode: (rootPath: string, id: string) => Promise<{ ok: boolean; code: string | null }>
  loadMainModule: (rootPath: string, id: string) => Promise<{ ok: boolean }>
}

export interface AuthAPI {
  login: () => Promise<void>
  logout: () => Promise<void>
  getStatus: () => Promise<{ loggedIn: boolean; email: string; plan: string }>
  onChanged: (callback: (data: { loggedIn: boolean; email: string }) => void) => () => void
}

export interface ActiveSpeechAPI {
  getSpeakers: (projectPath: string) => Promise<Array<{ id: number; name: string; created_at: string }>>
  createSpeaker: (payload: { name: string; projectPath: string }) => Promise<{ id: number; name: string }>
  addSample: (payload: { speakerId: number; source: string; audioBuffer: ArrayBuffer; projectId?: string; projectPath: string }) => Promise<{ id: number }>
  labelSpeaker: (payload: { utteranceId: number; speakerId?: number; speakerName?: string; projectPath: string }) => Promise<{ ok: boolean; speaker_id: number }>
  train: (projectPath: string) => Promise<{ job_id: number }>
  trainStatus: (payload: { jobId: number; projectPath: string }) => Promise<{ status: string; accuracy: number | null; deployed: boolean; error: string | null }>
  trainHistory: (projectPath: string) => Promise<Array<{ id: number; accuracy: number; is_active: boolean; trained_at: string; sample_count: number; notes: string | null }>>
  createSession: (payload: { projectPath: string; projectId?: string }) => Promise<{ id: number }>
  endSession: (payload: { sessionId: number; projectPath: string }) => Promise<{ ok: boolean }>
  getUtterances: (payload: { sessionId: number; projectPath: string }) => Promise<Array<{ id: number; text: string; speaker_name: string | null; speaker_id: number | null }>>
  getSessions: (projectPath: string) => Promise<Array<{ id: number; project_id: string | null; started_at: string; ended_at: string | null }>>
  startStream: (payload: { sessionId: number; projectPath: string }) => Promise<void>
  sendAudioChunk: (payload: { sessionId: number; audioBuffer: ArrayBuffer; projectPath: string }) => void
  stopStream: (payload: { sessionId: number }) => Promise<void>
  onUtterance: (callback: (evt: { sessionId: number; utterance_id: number; speaker_name: string | null; text: string }) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
    __rose__: Record<string, unknown>
  }
}
