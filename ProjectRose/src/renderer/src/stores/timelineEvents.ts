import type { TurnEvent } from '@shared/turnEvents'
import type {
  ChatMessage,
  AssistantMessage,
  ThinkingMessage,
  ToolMessage,
  AskUserMessage,
  InjectedMessage,
} from '../types/chatMessages'

// The slice of chat state a turn event can touch. Kept separate from the rest
// of the store so `applyTurnEvent` stays a pure function of it — the live
// stream and crash-recovery replay run the identical reducer, which is what
// makes a replayed timeline indistinguishable from the one the user watched.
export interface TimelineFields {
  messages: ChatMessage[]
  assistantPlaceholderId: string | null
  thinkingPlaceholderId: string | null
  pendingModelDisplay: string | null
  isLoading: boolean
}

export const emptyTimeline: TimelineFields = {
  messages: [],
  assistantPlaceholderId: null,
  thinkingPlaceholderId: null,
  pendingModelDisplay: null,
  isLoading: false,
}

let msgCounter = 0

export function makeId(): string {
  return `msg-${++msgCounter}`
}

// Push the id counter past every `msg-N` in a loaded conversation. Without
// this a conversation loaded after restart (counter back at 0) hands its next
// streamed message an id that already exists earlier in the timeline, and the
// placeholder `m.id === assistantPlaceholderId` matches two messages — tokens
// then append to both. Replay makes that collision a certainty rather than a
// possibility, so seeding is required before replaying a log.
export function seedMessageIds(messages: ChatMessage[]): void {
  for (const m of messages) {
    const match = /^msg-(?:u-)?(\d+)$/.exec(m.id)
    if (match) msgCounter = Math.max(msgCounter, Number(match[1]))
  }
}

function insertBefore(
  messages: ChatMessage[],
  targetId: string,
  insert: ChatMessage
): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === targetId)
  if (idx < 0) return [...messages, insert]
  return [...messages.slice(0, idx), insert, ...messages.slice(idx)]
}

function sealStreamingPlaceholders(state: TimelineFields): ChatMessage[] {
  return state.messages.map((m) => {
    if (m.id === state.thinkingPlaceholderId && m.role === 'thinking')
      return { ...m, streaming: false }
    if (m.id === state.assistantPlaceholderId && m.role === 'assistant')
      return { ...m, streaming: false }
    return m
  })
}

// Apply one streaming event to the timeline, returning the changed fields.
// Pure: no `Date.now()` beyond message timestamps, no store access.
export function applyTurnEvent(
  s: TimelineFields,
  event: TurnEvent
): Partial<TimelineFields> {
  switch (event.kind) {
    case 'token': {
      if (s.assistantPlaceholderId) {
        return {
          messages: s.messages.map((m) =>
            m.id === s.assistantPlaceholderId && m.role === 'assistant'
              ? { ...m, content: m.content + event.token }
              : m
          ),
        }
      }
      const newId = makeId()
      const msg: AssistantMessage = {
        id: newId,
        role: 'assistant',
        content: event.token,
        timestamp: Date.now(),
        streaming: true,
        modelDisplay: s.pendingModelDisplay ?? undefined,
      }
      return { messages: [...s.messages, msg], assistantPlaceholderId: newId }
    }

    case 'thinking': {
      if (s.thinkingPlaceholderId) {
        return {
          messages: s.messages.map((m) =>
            m.id === s.thinkingPlaceholderId && m.role === 'thinking'
              ? { ...m, content: m.content + event.content }
              : m
          ),
        }
      }
      const newId = makeId()
      const msg: ThinkingMessage = {
        id: newId,
        role: 'thinking',
        timestamp: Date.now(),
        content: event.content,
        streaming: true,
      }
      return {
        messages: s.assistantPlaceholderId
          ? insertBefore(s.messages, s.assistantPlaceholderId, msg)
          : [...s.messages, msg],
        thinkingPlaceholderId: newId,
      }
    }

    case 'tool-start': {
      const toolMsg: ToolMessage = {
        id: makeId(),
        role: 'tool',
        timestamp: Date.now(),
        toolId: event.id,
        name: event.name,
        params: event.params,
        result: null,
        error: false,
        pending: true,
      }
      return {
        messages: [...sealStreamingPlaceholders(s), toolMsg],
        thinkingPlaceholderId: null,
        assistantPlaceholderId: null,
      }
    }

    case 'tool-end':
      return {
        messages: s.messages.map((m) =>
          m.role === 'tool' && m.toolId === event.id
            ? { ...m, result: event.result, error: event.error, pending: false }
            : m
        ),
      }

    case 'ask-user': {
      const msg: AskUserMessage = {
        id: makeId(),
        role: 'ask_user',
        timestamp: Date.now(),
        questionId: event.questionId,
        question: event.question,
        options: event.options,
        answer: null,
      }
      return {
        messages: [...sealStreamingPlaceholders(s), msg],
        thinkingPlaceholderId: null,
        assistantPlaceholderId: null,
      }
    }

    case 'ask-answer':
      return {
        messages: s.messages.map((m) =>
          m.role === 'ask_user' && m.questionId === event.questionId
            ? { ...m, answer: event.answer }
            : m
        ),
      }

    case 'injected': {
      const msg: InjectedMessage = {
        id: makeId(),
        role: 'injected',
        timestamp: Date.now(),
        content: event.content,
        extensionId: event.extensionId,
        extensionName: event.extensionName,
        extensionIcon: event.extensionIcon,
      }
      return {
        messages: [...sealStreamingPlaceholders(s), msg],
        thinkingPlaceholderId: null,
        assistantPlaceholderId: null,
      }
    }

    case 'model-selected': {
      if (s.assistantPlaceholderId) {
        return {
          messages: s.messages.map((m) =>
            m.id === s.assistantPlaceholderId && m.role === 'assistant'
              ? { ...m, modelDisplay: event.modelDisplay }
              : m
          ),
        }
      }
      return { pendingModelDisplay: event.modelDisplay }
    }

    case 'stream-reset': {
      if (!s.assistantPlaceholderId) return {}
      return {
        messages: s.messages.map((m) =>
          m.id === s.assistantPlaceholderId && m.role === 'assistant'
            ? {
                ...m,
                content: '',
                modelDisplay: event.fallbackModel,
                fallbackNotice: `${m.modelDisplay ?? 'Model'} failed: ${event.errorMessage}`,
              }
            : m
        ),
      }
    }
  }
}

// Replay a recovered log over a loaded conversation's messages. Seeding the id
// counter first is what keeps replayed messages from colliding with saved ones.
export function replayTurnEvents(
  messages: ChatMessage[],
  events: TurnEvent[]
): ChatMessage[] {
  seedMessageIds(messages)
  let state: TimelineFields = { ...emptyTimeline, messages }
  for (const event of events) {
    state = { ...state, ...applyTurnEvent(state, event) }
  }
  return state.messages
}
