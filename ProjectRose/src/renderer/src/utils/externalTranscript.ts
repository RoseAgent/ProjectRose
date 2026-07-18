import type { ExternalTranscriptEntry } from '@shared/externalSession'
import type { ChatMessage, ToolMessage } from '../types/chatMessages'

// Convert external transcript entries into the renderer's ChatMessage[]. A
// tool_call and its matching tool_result (same toolCallId) merge into a single
// ToolMessage, so tool activity renders exactly like a live turn's tool calls.
// Used both to display an external session read-only and to seed a new Rose
// conversation when the user continues one with a Rose provider.
export function toChatMessages(entries: ExternalTranscriptEntry[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  const toolById = new Map<string, ToolMessage>()
  let seq = 0
  const nextId = (): string => `ext-${++seq}`

  for (const e of entries) {
    const timestamp = e.timestamp ? Date.parse(e.timestamp) || 0 : 0
    switch (e.kind) {
      case 'user_message':
        messages.push({ id: nextId(), role: 'user', content: e.content, timestamp })
        break
      case 'assistant_message':
        messages.push({
          id: nextId(),
          role: 'assistant',
          content: e.content,
          timestamp,
          modelDisplay: e.model,
        })
        break
      case 'assistant_thought':
        messages.push({ id: nextId(), role: 'thinking', content: e.content, timestamp })
        break
      case 'tool_call': {
        const tool: ToolMessage = {
          id: nextId(),
          role: 'tool',
          timestamp,
          toolId: e.toolCallId,
          name: e.toolName,
          params: asParams(e.input),
          result: null,
          error: false,
          pending: false,
        }
        toolById.set(e.toolCallId, tool)
        messages.push(tool)
        break
      }
      case 'tool_result': {
        const tool = toolById.get(e.toolCallId)
        if (tool) {
          // Fill the earlier tool_call in place.
          tool.result = e.output
          tool.error = e.isError === true
        } else {
          // Orphan result (call not seen) — surface it as its own tool cell.
          messages.push({
            id: nextId(),
            role: 'tool',
            timestamp,
            toolId: e.toolCallId,
            name: e.toolName,
            params: {},
            result: e.output,
            error: e.isError === true,
            pending: false,
          })
        }
        break
      }
    }
  }
  return messages
}

function asParams(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  if (input === undefined || input === null) return {}
  return { value: input }
}
