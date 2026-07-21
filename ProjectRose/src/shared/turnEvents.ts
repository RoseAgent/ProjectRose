// The durable record of what happened during a turn.
//
// A Conversation's `main.json` is only rewritten when a turn settles. While a
// turn is in flight the renderer appends each streaming event to a per-session
// `turn.jsonl` instead, so a crash mid-turn loses at most the events still
// sitting in the flush buffer rather than the whole turn. On load the log is
// replayed over `main.json`'s messages to reconstruct the timeline.
//
// These events are exactly the streaming notifications the main process already
// emits, plus `ask-answer` (the user replying to an `ask_user` question, which
// happens mid-turn and would otherwise be lost). Turn-boundary transitions
// (settle / abort / error) are deliberately absent: each is immediately
// followed by a full `main.json` write, so logging them would be redundant.

export type TurnEvent =
  | { kind: 'token'; token: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'tool-start'; id: string; name: string; params: Record<string, unknown> }
  | { kind: 'tool-end'; id: string; result: string; error: boolean }
  | { kind: 'ask-user'; questionId: string; question: string; options: string[] }
  | { kind: 'ask-answer'; questionId: string; answer: string }
  | {
      kind: 'injected'
      extensionId: string
      extensionName: string
      extensionIcon?: string
      content: string
    }
  | { kind: 'model-selected'; modelDisplay: string }
  | { kind: 'stream-reset'; fallbackModel: string; errorMessage: string }

// One line of `turn.jsonl`. `seq` is monotonic per conversation and is what
// makes replay idempotent: a settled `main.json` records the highest seq it
// already contains, so a log that outlives its own truncation replays nothing.
export interface TurnLogRecord {
  seq: number
  event: TurnEvent
}
