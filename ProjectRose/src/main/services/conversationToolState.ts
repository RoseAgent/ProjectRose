// Per-Conversation tool state that must outlive a single Turn.
//
// `ChatSession` (the Turn) is constructed and disposed every message cycle,
// so state the tools need across Turns — which files the Agent has already
// read (the read-before-modify guard) and the Agent's todo list — lives here
// instead, keyed by the Conversation id (`sessionId`).
//
// In-memory only: both pieces reset on app restart by design. Entries are
// dropped when the Conversation is deleted (wired in ipc/index.ts).

import type { TodoItem } from '../../shared/todos'

interface ConversationToolState {
  // Absolute paths the Agent has read this Conversation. write_file (on an
  // existing file) and edit_file refuse to touch paths not in this set.
  readFiles: Set<string>
  todos: TodoItem[]
}

const states = new Map<string, ConversationToolState>()

export function getConversationToolState(sessionId: string): ConversationToolState {
  let state = states.get(sessionId)
  if (!state) {
    state = { readFiles: new Set(), todos: [] }
    states.set(sessionId, state)
  }
  return state
}

export function clearConversationToolState(sessionId: string): void {
  states.delete(sessionId)
}
