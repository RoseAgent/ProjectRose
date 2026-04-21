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

export type ActiveView =
  | 'editor'
  | 'chat'
  | 'docker'
  | 'git'
  | 'heartbeat'
  | 'settings'
  | 'activeListening'
  | 'email'
  | 'discord'

export interface NavItem {
  viewId: ActiveView
  label: string
  visible: boolean
}
