import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { ExternalTranscript } from '@shared/externalSession'
import { useChat } from '../../stores/useChat'
import { toChatMessages } from '../../utils/externalTranscript'
import { MessageTimeline } from './MessageTimeline'
import { ContextStatusBar } from './ContextStatusBar'
import { ChatInput } from './ChatInput'
import styles from './ExternalTranscriptView.module.css'

// How often to check the on-disk session file for new entries. The poll is a
// cheap stat unless the file actually changed (main re-parses only then), so
// a resumed CLI run streams into this view without the user swapping to the
// terminal.
const POLL_INTERVAL_MS = 3000

// Within this many pixels of the bottom counts as "at the bottom" — the view
// keeps following new entries. Scrolled further up, updates land without
// moving the viewport.
const AT_BOTTOM_PX = 48

// Once the reader has scrolled more than this many cells above the visible
// bottom of the transcript, show the Return pill — new arrivals or not.
const BEHIND_PILL_THRESHOLD = 10

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
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // True while the user is (near) the bottom — new entries auto-scroll. Set
  // false the moment they scroll up to read; a ref because the scroll handler
  // and the messages effect both need the current value without re-renders.
  const pinnedRef = useRef(true)
  const prevLenRef = useRef(0)
  // Suppresses the Return pill during a programmatic smooth-scroll to the
  // bottom, so it doesn't flash while the animation passes "behind" cells.
  const autoScrollingRef = useRef(false)
  const [showReturnPill, setShowReturnPill] = useState(false)

  // How many timeline cells sit fully below the visible area. Cells, not raw
  // messages — consecutive tool calls collapse into one cell — which matches
  // what "behind" feels like to a reader.
  const countCellsBelowView = (el: HTMLDivElement): number => {
    const containerBottom = el.getBoundingClientRect().bottom
    let behind = 0
    for (const child of Array.from(el.children)) {
      if (child.getBoundingClientRect().top > containerBottom) behind++
    }
    return behind
  }

  const recomputeScrollState = (): void => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX
    pinnedRef.current = atBottom
    if (atBottom) autoScrollingRef.current = false
    setShowReturnPill(
      !atBottom && !autoScrollingRef.current && countCellsBelowView(el) > BEHIND_PILL_THRESHOLD
    )
  }

  const jumpToLatest = (): void => {
    pinnedRef.current = true
    autoScrollingRef.current = true
    setShowReturnPill(false)
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Follow the session live while it's open: re-read the transcript whenever
  // the CLI appends to it (e.g. a background `claude --resume` run).
  useEffect(() => {
    let mtime = 0
    let inFlight = false
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        const update = await window.api.external.getTranscriptUpdate(
          transcript.source,
          transcript.id,
          mtime
        )
        if (!update) return
        mtime = update.mtimeMs
        // Only apply if this session is still the one being viewed — the
        // interval is torn down on switch, but a slow IPC round-trip could
        // land after the fact.
        const current = useChat.getState().externalView
        if (current && current.source === transcript.source && current.id === transcript.id) {
          useChat.setState({ externalView: update.transcript })
        }
      } finally {
        inFlight = false
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [transcript.source, transcript.id])

  // Opening a session (or switching to another) starts pinned at the bottom.
  // Declared before the follow effect so its prevLen reset wins on switch.
  useEffect(() => {
    pinnedRef.current = true
    autoScrollingRef.current = false
    setShowReturnPill(false)
    prevLenRef.current = messages.length
    endRef.current?.scrollIntoView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript.source, transcript.id])

  // Follow new entries only while pinned to the bottom; otherwise leave the
  // viewport alone and refresh the Return-pill state against the grown list.
  useEffect(() => {
    const prev = prevLenRef.current
    prevLenRef.current = messages.length
    if (messages.length <= prev) return
    if (pinnedRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      recomputeScrollState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

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

      <div className={styles.timelineWrap}>
        {messages.length === 0 ? (
          <div className={styles.emptyBody}>No messages in this session.</div>
        ) : (
          <MessageTimeline
            messages={messages}
            tailRef={endRef}
            containerRef={containerRef}
            onScroll={recomputeScrollState}
          />
        )}
        {showReturnPill && (
          <button type="button" className={styles.jumpPill} onClick={jumpToLatest}>
            Return
          </button>
        )}
      </div>
      {transcript.entryCountTruncated && (
        <div className={styles.truncated}>Transcript truncated — showing the first entries only.</div>
      )}

      <ContextStatusBar />
      <ChatInput />
    </div>
  )
}
