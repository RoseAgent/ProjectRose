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

export type BaseView = 'editor' | 'chat' | 'heartbeat' | 'settings'

// Accepts base views and extension IDs (e.g. 'rose-discord')
export type ActiveView = BaseView | (string & Record<never, never>)

export interface NavItem {
  viewId: string
  label: string
  visible: boolean
}
