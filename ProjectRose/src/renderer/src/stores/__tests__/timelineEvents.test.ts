import { describe, it, expect } from 'vitest'
import type { TurnEvent } from '@shared/turnEvents'
import { replayTurnEvents } from '../timelineEvents'
import type {
  ChatMessage,
  AssistantMessage,
  ThinkingMessage,
  ToolMessage,
  AskUserMessage,
} from '../../types/chatMessages'

function userMsg(id: string, content: string): ChatMessage {
  return { id, role: 'user', content, timestamp: 0 }
}

// The turn a crash interrupts: the model thinks, starts answering, calls a
// tool, gets a result, then keeps answering.
const TURN: TurnEvent[] = [
  { kind: 'model-selected', modelDisplay: 'kimi-k2' },
  { kind: 'thinking', content: 'let me check ' },
  { kind: 'thinking', content: 'the file' },
  { kind: 'token', token: 'Reading' },
  { kind: 'token', token: ' it now.' },
  { kind: 'tool-start', id: 't1', name: 'read_file', params: { path: 'a.ts' } },
  { kind: 'tool-end', id: 't1', result: 'contents', error: false },
  { kind: 'token', token: 'Done.' },
]

describe('replayTurnEvents', () => {
  it('reconstructs an interrupted turn from its log', () => {
    const messages = replayTurnEvents([userMsg('u1', 'check a.ts')], TURN)

    expect(messages.map((m) => m.role)).toEqual([
      'user',
      'thinking',
      'assistant',
      'tool',
      'assistant',
    ])
    expect((messages[1] as ThinkingMessage).content).toBe('let me check the file')
    expect((messages[2] as AssistantMessage).content).toBe('Reading it now.')
    expect((messages[2] as AssistantMessage).modelDisplay).toBe('kimi-k2')
    const tool = messages[3] as ToolMessage
    expect(tool.name).toBe('read_file')
    expect(tool.result).toBe('contents')
    expect(tool.pending).toBe(false)
    expect((messages[4] as AssistantMessage).content).toBe('Done.')
  })

  it('replays nothing for a conversation that settled cleanly', () => {
    const saved = [userMsg('u1', 'hi')]
    expect(replayTurnEvents(saved, [])).toEqual(saved)
  })

  it('leaves the trailing reply and an unreturned tool call marked in-flight', () => {
    // A crash truncates the log mid-turn: no tool-end, no settle.
    const messages = replayTurnEvents([userMsg('u1', 'go')], TURN.slice(0, 6))
    const assistant = messages.find((m) => m.role === 'assistant') as AssistantMessage
    const tool = messages.find((m) => m.role === 'tool') as ToolMessage
    // tool-start seals the assistant placeholder; the tool never returned.
    expect(assistant.streaming).toBe(false)
    expect(tool.pending).toBe(true)
  })

  it('does not reuse ids already present in the saved conversation', () => {
    // Saved messages use the same `msg-N` scheme the replay generates. Without
    // seeding, replay restarts at msg-1 and collides — token appends would then
    // land on two different messages at once.
    const saved: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'first', timestamp: 0 },
      { id: 'msg-2', role: 'assistant', content: 'earlier reply', timestamp: 0 },
    ]
    const messages = replayTurnEvents(saved, [{ kind: 'token', token: 'new' }])
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length)
    expect((messages[1] as AssistantMessage).content).toBe('earlier reply')
  })

  it('applies an ask_user answer given before the crash', () => {
    const messages = replayTurnEvents(
      [userMsg('u1', 'go')],
      [
        { kind: 'ask-user', questionId: 'q1', question: 'Which one?', options: ['a', 'b'] },
        { kind: 'ask-answer', questionId: 'q1', answer: 'b' },
      ]
    )
    expect((messages[1] as AskUserMessage).answer).toBe('b')
  })

  it('keeps a fallback-model reset from duplicating the failed attempt', () => {
    const messages = replayTurnEvents(
      [userMsg('u1', 'go')],
      [
        { kind: 'model-selected', modelDisplay: 'kimi-k2' },
        { kind: 'token', token: 'partial answer' },
        { kind: 'stream-reset', fallbackModel: 'sonnet', errorMessage: 'overloaded' },
        { kind: 'token', token: 'real answer' },
      ]
    )
    const assistant = messages[1] as AssistantMessage
    expect(assistant.content).toBe('real answer')
    expect(assistant.modelDisplay).toBe('sonnet')
    expect(assistant.fallbackNotice).toContain('overloaded')
  })
})
