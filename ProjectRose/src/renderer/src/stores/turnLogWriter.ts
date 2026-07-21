import type { TurnEvent, TurnLogRecord } from '@shared/turnEvents'

// Buffered writer for the in-flight turn's event log.
//
// Events arrive far too fast to send one IPC message per token, so they are
// batched into a short window and flushed as a group. The window is the entire
// crash-loss surface: whatever is still buffered when the machine dies is gone,
// everything already flushed survives. 200ms keeps that loss imperceptible
// while collapsing a fast token stream into ~5 appends a second.
const FLUSH_INTERVAL_MS = 200

let buffer: TurnLogRecord[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let target: { sessionId: string; workspacePath: string } | null = null
let seq = 0

// Highest seq handed out so far. Recorded into main.json when the turn settles
// so replay knows which log records are already folded in.
export function currentSeq(): number {
  return seq
}

// Point the writer at a conversation and continue its sequence. `fromSeq` is
// the conversation's applied seq plus anything recovered from its log, so a
// resumed conversation never reissues a seq an existing record already used.
export function beginTurnLog(sessionId: string, workspacePath: string, fromSeq: number): void {
  flush()
  target = { sessionId, workspacePath }
  seq = fromSeq
}

export function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (buffer.length === 0 || !target) return
  const records = buffer
  buffer = []
  window.api.session
    .appendEvents(target.sessionId, target.workspacePath, records)
    .catch(() => {
      // Durability is best-effort: a failed append costs crash coverage for
      // these events, not the turn itself, which still gets its full save.
    })
}

export function logTurnEvent(sessionId: string, event: TurnEvent): void {
  // A late event from an abandoned session must not be appended to whatever
  // conversation is open now.
  if (target?.sessionId !== sessionId) return
  buffer.push({ seq: ++seq, event })
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
}

// Stop logging — the turn has settled and its full save supersedes the log.
export function endTurnLog(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  buffer = []
  target = null
}
