import type { MessageAttachment } from '@shared/roseModelTypes'

interface BaseMessage {
  id: string
  timestamp: number
}

export interface UserMessage extends BaseMessage {
  role: 'user'
  content: string
  attachments?: MessageAttachment[]
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant'
  content: string
  streaming?: boolean
  isError?: boolean
  modelDisplay?: string
  fallbackNotice?: string
}

export interface ToolMessage extends BaseMessage {
  role: 'tool'
  toolId: string
  name: string
  params: Record<string, unknown>
  result: string | null
  error: boolean
  pending: boolean
}

export interface ThinkingMessage extends BaseMessage {
  role: 'thinking'
  content: string
  streaming?: boolean
}

export interface AskUserMessage extends BaseMessage {
  role: 'ask_user'
  questionId: string
  question: string
  options: string[]
  answer: string | null
}

export interface InjectedMessage extends BaseMessage {
  role: 'injected'
  content: string
  extensionId: string
  extensionName: string
  extensionIcon?: string
}

export type ChatMessage =
  | UserMessage
  | AssistantMessage
  | ToolMessage
  | ThinkingMessage
  | AskUserMessage
  | InjectedMessage

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  // Absolute path of the Workspace this Conversation is bound to. Every
  // Conversation always has one — a Conversation drives its own Workspace.
  workspacePath: string
}

export type CompressedApiMessage = { role: 'user' | 'assistant' | 'system'; content: string }

export interface ContextStatus {
  estimatedTokens: number
  contextLength: number
  percentUsed: number
  totalToolSteps: number
}

export interface CompressionSnapshot {
  compressedMessages: CompressedApiMessage[]
  compressedFromCount: number
  compressedFromRawCount: number
  compressedAt: number
  // How many older turns folded into the summary. Optional because snapshots
  // persisted before this field existed will load without it; the timeline
  // divider falls back to a generic label.
  compressedTurnCount?: number
}
