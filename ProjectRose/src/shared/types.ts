export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface WriteFilePayload {
  filePath: string
  content: string
}

export interface TerminalWritePayload {
  sessionId: string
  data: string
}

export interface TerminalResizePayload {
  sessionId: string
  cols: number
  rows: number
}

export type BaseView = 'editor' | 'chat' | 'settings'

// Accepts base views and extension IDs (e.g. 'rose-discord')
export type ActiveView = BaseView | (string & Record<never, never>)

export interface ModelConfig {
  provider: 'ollama' | 'projectrose' | 'kimi' | 'bedrock'
  modelName: string
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
  type: 'core' | 'extension'
  extensionId?: string
  extensionName?: string
}
