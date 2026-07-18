import { describe, it, expect } from 'vitest'
import { toChatMessages } from '../externalTranscript'
import type { ExternalTranscriptEntry } from '@shared/externalSession'
import type { AssistantMessage, ToolMessage } from '../../types/chatMessages'

describe('toChatMessages', () => {
  it('maps user/assistant/thought entries to their chat roles', () => {
    const entries: ExternalTranscriptEntry[] = [
      { kind: 'user_message', content: 'hi' },
      { kind: 'assistant_thought', content: 'thinking...' },
      { kind: 'assistant_message', content: 'hello', model: 'claude-opus' }
    ]
    const messages = toChatMessages(entries)
    expect(messages.map((m) => m.role)).toEqual(['user', 'thinking', 'assistant'])
    expect((messages[2] as AssistantMessage).modelDisplay).toBe('claude-opus')
  })

  it('merges a tool_call with its matching tool_result into one ToolMessage', () => {
    const entries: ExternalTranscriptEntry[] = [
      { kind: 'tool_call', toolCallId: 't1', toolName: 'read_file', input: { path: 'a.ts' } },
      { kind: 'tool_result', toolCallId: 't1', toolName: 'read_file', output: 'contents', isError: false }
    ]
    const messages = toChatMessages(entries)
    expect(messages).toHaveLength(1)
    const tool = messages[0] as ToolMessage
    expect(tool.role).toBe('tool')
    expect(tool.params).toEqual({ path: 'a.ts' })
    expect(tool.result).toBe('contents')
    expect(tool.error).toBe(false)
    expect(tool.pending).toBe(false)
  })

  it('surfaces an orphan tool_result as its own cell', () => {
    const entries: ExternalTranscriptEntry[] = [
      { kind: 'tool_result', toolCallId: 'ghost', toolName: 'grep', output: 'x', isError: true }
    ]
    const messages = toChatMessages(entries)
    expect(messages).toHaveLength(1)
    const tool = messages[0] as ToolMessage
    expect(tool.error).toBe(true)
    expect(tool.params).toEqual({})
  })

  it('wraps non-object tool input as { value }', () => {
    const entries: ExternalTranscriptEntry[] = [
      { kind: 'tool_call', toolCallId: 't1', toolName: 'run', input: 'ls -la' }
    ]
    const tool = toChatMessages(entries)[0] as ToolMessage
    expect(tool.params).toEqual({ value: 'ls -la' })
  })

  it('assigns stable ext-N ids that cannot collide with live msg-N ids', () => {
    const entries: ExternalTranscriptEntry[] = [
      { kind: 'user_message', content: 'a' },
      { kind: 'user_message', content: 'b' }
    ]
    const ids = toChatMessages(entries).map((m) => m.id)
    expect(ids).toEqual(['ext-1', 'ext-2'])
  })
})
