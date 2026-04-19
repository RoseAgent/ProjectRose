import { useEffect, useState } from 'react'
import { LabelSpeakerDialog } from './LabelSpeakerDialog'
import styles from './ActiveListeningView.module.css'

interface Session {
  id: number
  project_id: string | null
  started_at: string
  ended_at: string | null
}

interface Utterance {
  id: number
  text: string
  speaker_name: string | null
  speaker_id: number | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'ongoing'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

function SessionTranscript({ sessionId }: { sessionId: number }): JSX.Element {
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [loading, setLoading] = useState(true)
  const [labelTarget, setLabelTarget] = useState<number | null>(null)

  useEffect(() => {
    window.api.activeSpeech.getUtterances(sessionId)
      .then(setUtterances)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sessionId])

  const handleLabel = (utteranceId: number, speakerName: string): void => {
    setUtterances((prev) =>
      prev.map((u) => (u.id === utteranceId ? { ...u, speaker_name: speakerName } : u))
    )
    setLabelTarget(null)
  }

  if (loading) return <div className={styles.historyLoading}>Loading...</div>
  if (utterances.length === 0) return <div className={styles.historyEmpty}>No utterances recorded.</div>

  return (
    <div className={styles.historyTranscript}>
      {utterances.map((u) => (
        <div key={u.id} className={styles.utterance}>
          <span className={styles.speakerName}>
            {u.speaker_name ? (
              u.speaker_name
            ) : (
              <button className={styles.unknownBtn} onClick={() => setLabelTarget(u.id)}>
                Unknown
              </button>
            )}
            {':'}
          </span>
          <span className={styles.utteranceText}>{u.text}</span>
        </div>
      ))}

      {labelTarget !== null && (
        <LabelSpeakerDialog
          utteranceId={labelTarget}
          onLabel={handleLabel}
          onCancel={() => setLabelTarget(null)}
        />
      )}
    </div>
  )
}

export function SessionHistory(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    window.api.activeSpeech.getSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className={styles.historyLoading}>Loading sessions...</div>

  if (sessions.length === 0) {
    return <div className={styles.historyEmpty}>No past sessions yet. Start listening to record one.</div>
  }

  return (
    <div className={styles.historyList}>
      {sessions.map((s) => (
        <div key={s.id} className={styles.historySession}>
          <button
            className={styles.historySessionHeader}
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
          >
            <span className={styles.historySessionDate}>{formatDate(s.started_at)}</span>
            <span className={styles.historySessionMeta}>
              {formatDuration(s.started_at, s.ended_at)}
              {s.project_id && ` · ${s.project_id.split('/').pop()}`}
            </span>
            <span className={styles.historyChevron}>{expanded === s.id ? '▲' : '▼'}</span>
          </button>

          {expanded === s.id && <SessionTranscript sessionId={s.id} />}
        </div>
      ))}
    </div>
  )
}
