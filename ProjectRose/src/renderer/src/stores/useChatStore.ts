import { create } from 'zustand'
import { useProjectStore } from './useProjectStore'

let msgCounter = 0

interface BaseMessage {
  id: string
  timestamp: number
}

export interface UserMessage extends BaseMessage {
  role: 'user'
  content: string
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

export type ChatMessage = UserMessage | AssistantMessage | ToolMessage | ThinkingMessage

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  inputValue: string
  currentSessionId: string | null
  sessions: SessionMeta[]
  searchQuery: string
  assistantPlaceholderId: string | null
  thinkingPlaceholderId: string | null

  setInputValue: (value: string) => void
  setSearchQuery: (q: string) => void
  sendMessage: () => Promise<void>
  clearMessages: () => void
  appendToolStart: (data: { id: string; name: string; params: Record<string, unknown> }) => void
  resolveToolEnd: (data: { id: string; result: string; error: boolean }) => void
  appendThinking: (data: { content: string }) => void
  appendToken: (data: { token: string }) => void

  loadSessions: (rootPath: string) => Promise<void>
  switchSession: (rootPath: string, sessionId: string) => Promise<void>
  newSession: () => void
  renameSession: (rootPath: string, sessionId: string, title: string) => Promise<void>
  deleteSession: (rootPath: string, sessionId: string) => Promise<void>
}

function generateId(): string {
  return crypto.randomUUID()
}

function persistSession(rootPath: string, sessionId: string, title: string, createdAt: number, messages: ChatMessage[]): void {
  window.api.session.save(rootPath, {
    id: sessionId,
    title,
    createdAt,
    updatedAt: Date.now(),
    messages: messages as unknown[]
  }).catch(() => { /* persistence failures are non-fatal */ })
}

function insertBefore(messages: ChatMessage[], targetId: string, insert: ChatMessage): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === targetId)
  if (idx < 0) return [...messages, insert]
  return [...messages.slice(0, idx), insert, ...messages.slice(idx)]
}

function sanitizeLoadedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if ((m.role === 'assistant' || m.role === 'thinking') && (m as AssistantMessage).streaming) {
      return { ...m, streaming: false, content: (m as AssistantMessage).content || '[interrupted]' }
    }
    return m
  })
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isLoading: false,
  inputValue: '',
  currentSessionId: null,
  sessions: [],
  searchQuery: '',
  assistantPlaceholderId: null,
  thinkingPlaceholderId: null,

  setInputValue: (value) => set({ inputValue: value }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  appendToken: (data) => {
    set((s) => {
      if (!s.assistantPlaceholderId) return s
      return {
        messages: s.messages.map((m) =>
          m.id === s.assistantPlaceholderId && m.role === 'assistant'
            ? { ...m, content: m.content + data.token }
            : m
        )
      }
    })
  },

  appendToolStart: (data) => {
    const msg: ToolMessage = {
      id: `msg-${++msgCounter}`,
      role: 'tool',
      timestamp: Date.now(),
      toolId: data.id,
      name: data.name,
      params: data.params,
      result: null,
      error: false,
      pending: true
    }
    set((s) => ({
      messages: s.assistantPlaceholderId
        ? insertBefore(s.messages, s.assistantPlaceholderId, msg)
        : [...s.messages, msg]
    }))
  },

  resolveToolEnd: (data) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === 'tool' && m.toolId === data.id
          ? { ...m, result: data.result, error: data.error, pending: false }
          : m
      )
    }))
  },

  appendThinking: (data) => {
    set((s) => {
      if (s.thinkingPlaceholderId) {
        return {
          messages: s.messages.map((m) =>
            m.id === s.thinkingPlaceholderId && m.role === 'thinking'
              ? { ...m, content: m.content + data.content }
              : m
          )
        }
      }
      const thinkingId = `msg-${++msgCounter}`
      const msg: ThinkingMessage = {
        id: thinkingId,
        role: 'thinking',
        timestamp: Date.now(),
        content: data.content,
        streaming: true
      }
      return {
        messages: s.assistantPlaceholderId
          ? insertBefore(s.messages, s.assistantPlaceholderId, msg)
          : [...s.messages, msg],
        thinkingPlaceholderId: thinkingId
      }
    })
  },

  sendMessage: async () => {
    const { inputValue, isLoading } = get()
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    const rootPath = useProjectStore.getState().rootPath
    if (!rootPath) return

    // Snapshot API messages before adding new messages to state
    const apiMessages = get().messages
      .filter((m): m is UserMessage | AssistantMessage =>
        (m.role === 'user' || m.role === 'assistant') && !(m as AssistantMessage).streaming
      )
      .map((m) => ({ role: m.role, content: m.content }))

    const userMsg: UserMessage = {
      id: `msg-${++msgCounter}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    }

    const assistantMsg: AssistantMessage = {
      id: `msg-${++msgCounter}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true
    }

    // Create session on first message
    let sessionId = get().currentSessionId
    let sessionCreatedAt = Date.now()
    const sessionTitle = trimmed.slice(0, 50)
    const isNewSession = !sessionId

    if (isNewSession) {
      sessionId = generateId()
      set((s) => ({
        currentSessionId: sessionId,
        sessions: [{ id: sessionId!, title: sessionTitle, createdAt: sessionCreatedAt, updatedAt: sessionCreatedAt }, ...s.sessions]
      }))
    }

    const session = get().sessions.find((s) => s.id === sessionId)
    const createdAt = session?.createdAt ?? sessionCreatedAt
    const title = session?.title ?? sessionTitle

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      inputValue: '',
      isLoading: true,
      assistantPlaceholderId: assistantMsg.id,
      thinkingPlaceholderId: null
    }))

    persistSession(rootPath, sessionId!, title, createdAt, get().messages)

    const cleanupToken = window.api.onAiToken((d) => get().appendToken(d))
    const cleanupToolStart = window.api.onAiToolCallStart((d) => get().appendToolStart(d))
    const cleanupToolEnd = window.api.onAiToolCallEnd((d) => get().resolveToolEnd(d))
    const cleanupThinking = window.api.onAiThinking((d) => get().appendThinking(d))
    const cleanupModelSelected = window.api.onAiModelSelected((d) => {
      const pid = get().assistantPlaceholderId
      if (!pid) return
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === pid && m.role === 'assistant' ? { ...m, modelDisplay: d.modelDisplay } : m
        )
      }))
    })

    const cleanupStreamReset = window.api.onAiStreamReset((d) => {
      const pid = get().assistantPlaceholderId
      if (!pid) return
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === pid && m.role === 'assistant'
            ? { ...m, content: '', modelDisplay: d.fallbackModel, fallbackNotice: `${m.modelDisplay ?? 'Model'} failed: ${d.errorMessage}` }
            : m
        )
      }))
    })

    const cleanup = (): void => {
      cleanupToken()
      cleanupToolStart()
      cleanupToolEnd()
      cleanupThinking()
      cleanupModelSelected()
      cleanupStreamReset()
    }

    try {
      const response = await window.api.aiChat([...apiMessages, { role: 'user', content: trimmed }], rootPath)

      cleanup()

      const placeholderId = get().assistantPlaceholderId
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id === placeholderId && m.role === 'assistant') {
            return { ...m, streaming: false, modelDisplay: response.modelDisplay }
          }
          if (m.role === 'thinking' && (m as ThinkingMessage).streaming) {
            return { ...m, streaming: false }
          }
          return m
        }),
        isLoading: false,
        assistantPlaceholderId: null,
        thinkingPlaceholderId: null
      }))

      persistSession(rootPath, sessionId!, title, createdAt, get().messages)
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, updatedAt: Date.now() } : sess
        )
      }))

      if (response.modifiedFiles.length > 0) {
        useProjectStore.getState().refreshTree()
      }
    } catch (err) {
      cleanup()

      const placeholderId = get().assistantPlaceholderId
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id === placeholderId && m.role === 'assistant') {
            return { ...m, content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`, streaming: false, isError: true }
          }
          if (m.role === 'thinking' && (m as ThinkingMessage).streaming) {
            return { ...m, streaming: false }
          }
          return m
        }),
        isLoading: false,
        assistantPlaceholderId: null,
        thinkingPlaceholderId: null
      }))

      persistSession(rootPath, sessionId!, title, createdAt, get().messages)
    }
  },

  clearMessages: () => set({ messages: [], isLoading: false }),

  loadSessions: async (rootPath) => {
    const sessions = await window.api.session.list(rootPath)
    set({ sessions: sessions as SessionMeta[] })

    if (sessions.length > 0) {
      const first = sessions[0]
      const loaded = await window.api.session.load(rootPath, first.id)
      if (loaded) {
        set({
          currentSessionId: first.id,
          messages: sanitizeLoadedMessages((loaded.messages as ChatMessage[]) ?? [])
        })
      }
    }
  },

  switchSession: async (rootPath, sessionId) => {
    const loaded = await window.api.session.load(rootPath, sessionId)
    if (loaded) {
      set({
        currentSessionId: sessionId,
        messages: sanitizeLoadedMessages((loaded.messages as ChatMessage[]) ?? []),
        isLoading: false,
        assistantPlaceholderId: null,
        thinkingPlaceholderId: null
      })
    }
  },

  newSession: () => set({ currentSessionId: null, messages: [], isLoading: false, assistantPlaceholderId: null, thinkingPlaceholderId: null }),

  renameSession: async (rootPath, sessionId, title) => {
    const loaded = await window.api.session.load(rootPath, sessionId)
    if (!loaded) return
    await window.api.session.save(rootPath, { ...loaded, title, updatedAt: Date.now() })
    set((s) => ({
      sessions: s.sessions.map((sess) => sess.id === sessionId ? { ...sess, title } : sess)
    }))
  },

  deleteSession: async (rootPath, sessionId) => {
    await window.api.session.delete(rootPath, sessionId)
    const wasActive = get().currentSessionId === sessionId
    set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== sessionId) }))
    if (wasActive) get().newSession()
  }
}))
