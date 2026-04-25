import { useState, useRef, useEffect } from 'react'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import type { Utterance, Speaker } from '../../stores/useActiveListeningStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import styles from './TranscriptView.module.css'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function speakerColor(name: string | null): string {
  if (!name) return 'var(--color-text-muted)'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 40%, 32%)`
}

function SpeakerChip({ utterance, displayName, speakers, onLabel }: {
  utterance: Utterance
  displayName: string
  speakers: Speaker[]
  onLabel: (utteranceId: number, speakerId: number | null, speakerName: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = displayName
  const color = speakerColor(utterance.speakerId !== null ? displayName : null)

  const handleSelect = (speaker: Speaker): void => {
    onLabel(utterance.utteranceId, speaker.id, speaker.name)
    setOpen(false)
  }

  const handleNewSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    onLabel(utterance.utteranceId, null, name)
    setNewName('')
    setShowNew(false)
    setOpen(false)
  }

  return (
    <div className={styles.chipWrap} ref={dropRef}>
      <button
        className={styles.chip}
        style={{ background: color }}
        onClick={() => setOpen((v) => !v)}
        title="Click to label speaker"
      >
        {label} ▾
      </button>
      {open && (
        <div className={styles.dropdown}>
          {speakers.map((s) => (
            <button key={s.id} className={styles.dropItem} onClick={() => handleSelect(s)}>
              {s.name}
            </button>
          ))}
          {!showNew ? (
            <button className={styles.dropItem} onClick={() => setShowNew(true)}>
              + New person
            </button>
          ) : (
            <form className={styles.newNameForm} onSubmit={handleNewSubmit}>
              <input
                className={styles.newNameInput}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name..."
                autoFocus
              />
              <button type="submit" className={styles.newNameBtn}>Add</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function resolveDisplayName(
  utterance: Utterance,
  enrolledSpeakerId: number | null,
  userName: string
): string {
  if (!userName) return utterance.speakerName ?? 'Unknown'

  // Match by enrolled speaker ID (primary — works after enrollment)
  if (utterance.speakerId !== null && enrolledSpeakerId !== null &&
      Number(utterance.speakerId) === Number(enrolledSpeakerId)) {
    return userName
  }

  // Fallback: "User" is the default name written to the DB during enrollment
  // when userName wasn't set yet. Substitute the real name if we have it.
  if (utterance.speakerName?.toLowerCase() === 'user') {
    return userName
  }

  return utterance.speakerName ?? 'Unknown'
}

export function TranscriptView(): JSX.Element {
  const utterances = useActiveListeningStore((s) => s.utterances)
  const speakers = useActiveListeningStore((s) => s.speakers)
  const sessionId = useActiveListeningStore((s) => s.sessionId)
  const isDrafting = useActiveListeningStore((s) => s.isDrafting)
  const draftSecondsLeft = useActiveListeningStore((s) => s.draftSecondsLeft)
  const rootPath = useProjectStore((s) => s.rootPath)
  const userName = useSettingsStore((s) => s.userName)
  const roseSpeechSpeakerId = useSettingsStore((s) => s.roseSpeechSpeakerId)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [retraining, setRetraining] = useState(false)
  const [trainResult, setTrainResult] = useState<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [utterances.length, isDrafting])

  const handleLabel = async (utteranceId: number, speakerId: number | null, speakerName: string): Promise<void> => {
    if (!rootPath) return
    try {
      const result = await window.api.activeSpeech.labelSpeaker({
        utteranceId,
        speakerId: speakerId ?? undefined,
        speakerName: speakerId === null ? speakerName : undefined,
        projectPath: rootPath
      })
      useActiveListeningStore.getState().updateUtteranceSpeaker(utteranceId, speakerName)
      if (speakerId === null) {
        useActiveListeningStore.getState().addSpeaker({ id: result.speaker_id, name: speakerName })
      }
    } catch {
      // label failed silently
    }
  }

  const handleRetrain = async (): Promise<void> => {
    if (!rootPath || retraining) return
    setRetraining(true)
    setTrainResult(null)
    try {
      const { job_id } = await window.api.activeSpeech.train(rootPath)
      const poll = setInterval(async () => {
        const status = await window.api.activeSpeech.trainStatus({ jobId: job_id, projectPath: rootPath })
        if (status.status === 'complete' || status.status === 'failed') {
          clearInterval(poll)
          setRetraining(false)
          setTrainResult(
            status.status === 'complete' && status.accuracy !== null
              ? `${Math.round(status.accuracy * 100)}% accuracy`
              : 'Training failed'
          )
        }
      }, 2000)
    } catch {
      setRetraining(false)
      setTrainResult('Error')
    }
  }

  const hasLabeledUtterances = utterances.some((u) => u.speakerName !== null)

  return (
    <div className={styles.transcript}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>
          SESSION {sessionId !== null ? `#${String(sessionId).padStart(3, '0')}` : '—'}
        </span>
        <div className={styles.retrainArea}>
          {trainResult && <span className={styles.trainResult}>{trainResult}</span>}
          <button
            className={styles.retrainBtn}
            onClick={handleRetrain}
            disabled={retraining || !hasLabeledUtterances}
            title={hasLabeledUtterances ? 'Retrain voice model with labeled data' : 'Label some speakers first'}
          >
            {retraining ? 'Training…' : '↺ Retrain'}
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {utterances.length === 0 && (
          <div className={styles.empty}>No utterances yet. Start speaking.</div>
        )}
        {utterances.map((u) => (
          <div key={u.utteranceId} className={styles.row}>
            <SpeakerChip
              utterance={u}
              displayName={resolveDisplayName(u, roseSpeechSpeakerId, userName)}
              speakers={speakers}
              onLabel={handleLabel}
            />
            <span className={styles.text}>{u.text}</span>
            <span className={styles.time}>{formatTime(u.timestamp)}</span>
          </div>
        ))}
        {isDrafting && (
          <div className={styles.draftingChip}>
            <span className={styles.draftDot} />
            DRAFTING · auto-send in {draftSecondsLeft ?? 0}s
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
