// Todo list the Agent maintains during a Conversation via the `todo_write`
// tool. Per-Conversation and in-memory only — the list resets on app restart.
// The renderer receives the full list on every update via AI_TODOS_UPDATED.

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  content: string
  status: TodoStatus
}
