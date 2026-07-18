import clsx from 'clsx'
import type { ExternalTranscript } from '@shared/externalSession'
import { toChatMessages } from '../../utils/externalTranscript'
import { MessageTimeline } from './MessageTimeline'
import { ContextStatusBar } from './ContextStatusBar'
import { ChatInput } from './ChatInput'
import styles from './ExternalTranscriptView.module.css'

// Viewer for an External Session (Claude Code / Codex). It converts the
// parsed transcript into the renderer's ChatMessage shape and renders it
// through the SAME MessageTimeline the live chat panel uses, so an external
// session looks identical to a Rose conversation. The transcript itself is
// never mutated — the composer below either resumes the session in its own
// CLI (Claude/Codex picked in the ModelPicker) or forks it into a new Rose
// conversation (Rose provider picked).
export function ExternalTranscriptView({ transcript }: { transcript: ExternalTranscript }): JSX.Element {
  const isClaude = transcript.source === 'claude-code'
  const sourceLabel = isClaude ? 'CC' : 'CX'
  const badgeCls = isClaude ? styles.badgeClaude : styles.badgeCodex

  const messages = toChatMessages(transcript.entries)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={clsx(styles.badge, badgeCls)}>{sourceLabel}</span>
        <div className={styles.headText}>
          <div className={styles.headTitle}>{transcript.title}</div>
          <div className={styles.headPath} title={transcript.workspacePath}>
            {transcript.workspacePath}
          </div>
        </div>
        <span
          className={styles.readonly}
          title="The transcript is read-only — sending resumes it in its own CLI, or forks it into a Rose conversation"
        >
          read-only
        </span>
      </div>

      {messages.length === 0 ? (
        <div className={styles.emptyBody}>No messages in this session.</div>
      ) : (
        <MessageTimeline messages={messages} />
      )}
      {transcript.entryCountTruncated && (
        <div className={styles.truncated}>Transcript truncated — showing the first entries only.</div>
      )}

      <ContextStatusBar />
      <ChatInput />
    </div>
  )
}
