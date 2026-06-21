// Shared transcript renderer for any Detached Run with tools (ADR 0014).
// Originally lived inline in RoutinesPage; extracted in ADR 0015 once
// rose-channels became the second consumer.
//
// The component is intentionally header-agnostic — consumer pages render
// their own metadata header above it (routine slug + scheduled time, or
// channel rule slug + message source + sender). This component only knows
// how to render: stats row, prompt cell, transcript entries, final response,
// and an optional error banner.

import type {
  DetachedRunTranscript,
  DetachedRunTranscriptEntry
} from '@shared/detachedRunTranscript'
import styles from './DetachedRunTranscriptView.module.css'

export interface DetachedRunTranscriptViewProps {
  /** Optional prompt to render in a User cell above the transcript body. */
  prompt?: string
  /** Required transcript shape returned by `ctx.runDetachedRunWithTools`. */
  transcript: DetachedRunTranscript
  /** Optional error string; renders a red banner above the transcript when present. */
  error?: string | null
}

export function DetachedRunTranscriptView({
  prompt,
  transcript,
  error
}: DetachedRunTranscriptViewProps): JSX.Element {
  return (
    <>
      <div className={styles.transcriptHeader}>
        <span>{transcript.modelDisplay}</span>
        <span>{transcript.durationMs}ms</span>
        <span>
          {transcript.inputTokens}↓ {transcript.outputTokens}↑
        </span>
      </div>
      {error && <div className={styles.transcriptError}>{error}</div>}
      {prompt !== undefined && (
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Prompt</div>
          <div className={`${styles.transcriptCell} ${styles.cellUser}`}>
            <div className={styles.transcriptContent}>{prompt}</div>
          </div>
        </div>
      )}
      <div className={styles.transcriptBody}>
        {transcript.entries.length === 0 ? (
          <div className={styles.empty}>No transcript captured.</div>
        ) : (
          transcript.entries.map((e, i) => <TranscriptCell key={i} entry={e} />)
        )}
      </div>
      {transcript.finalText.trim() && (
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Final Response</div>
          <div className={`${styles.transcriptCell} ${styles.cellAssistant}`}>
            <div className={styles.transcriptContent}>{transcript.finalText}</div>
          </div>
        </div>
      )}
    </>
  )
}

function TranscriptCell({ entry }: { entry: DetachedRunTranscriptEntry }): JSX.Element {
  switch (entry.kind) {
    case 'user_message':
      return (
        <div className={`${styles.transcriptCell} ${styles.cellUser}`}>
          <div className={styles.transcriptKind}>User</div>
          <div className={styles.transcriptContent}>{entry.content}</div>
        </div>
      )
    case 'assistant_thought':
      return (
        <div className={`${styles.transcriptCell} ${styles.cellThought}`}>
          <div className={styles.transcriptKind}>Thought</div>
          <div className={styles.transcriptContent}>{entry.content}</div>
        </div>
      )
    case 'assistant_message':
      return (
        <div className={`${styles.transcriptCell} ${styles.cellAssistant}`}>
          <div className={styles.transcriptKind}>Assistant</div>
          <div className={styles.transcriptContent}>{entry.content}</div>
        </div>
      )
    case 'tool_call':
      return (
        <div className={`${styles.transcriptCell} ${styles.cellToolCall}`}>
          <div className={styles.transcriptKind}>Tool call · {entry.toolName}</div>
          <div className={styles.transcriptContent}>
            {typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input, null, 2)}
          </div>
        </div>
      )
    case 'tool_result':
      return (
        <div className={`${styles.transcriptCell} ${styles.cellToolResult}`}>
          <div className={styles.transcriptKind}>Tool result · {entry.toolName}</div>
          <div className={styles.transcriptContent}>{entry.output}</div>
        </div>
      )
  }
}
