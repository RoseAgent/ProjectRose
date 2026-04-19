import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { ActiveListeningSetupWizard } from './ActiveListeningSetupWizard'
import { LiveTranscript } from './LiveTranscript'
import { SessionHistory } from './SessionHistory'
import { TrainPanel } from './TrainPanel'
import styles from './ActiveListeningView.module.css'

type Tab = 'live' | 'history'

export function ActiveListeningView(): JSX.Element {
  const setupComplete = useSettingsStore((s) => s.activeListeningSetupComplete)
  const update = useSettingsStore((s) => s.update)
  const rootPath = useProjectStore((s) => s.rootPath)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [sessionError, setSessionError] = useState('')
  const [tab, setTab] = useState<Tab>('live')

  useEffect(() => {
    if (!setupComplete) return

    let sid: number | null = null
    const active = { value: true }

    const start = async (): Promise<void> => {
      try {
        const session = await window.api.activeSpeech.createSession(rootPath || undefined)
        if (!active.value) return
        sid = session.id
        setSessionId(session.id)
      } catch (e) {
        if (active.value) setSessionError(e instanceof Error ? e.message : 'Failed to create session.')
      }
    }

    start()

    return (): void => {
      active.value = false
      if (sid !== null) {
        window.api.activeSpeech.endSession(sid).catch(() => {})
      }
    }
  }, [setupComplete, rootPath])

  if (!setupComplete) {
    return (
      <ActiveListeningSetupWizard
        onComplete={() => update({ activeListeningSetupComplete: true })}
      />
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabRow}>
          <button
            className={`${styles.tab} ${tab === 'live' ? styles.tabActive : ''}`}
            onClick={() => setTab('live')}
          >
            Live
          </button>
          <button
            className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
        </div>
        <TrainPanel />
      </div>

      {tab === 'live' && (
        sessionError ? (
          <div className={styles.error}>Failed to start session: {sessionError}</div>
        ) : sessionId === null ? (
          <div className={styles.loading}>Starting session...</div>
        ) : (
          <LiveTranscript sessionId={sessionId} />
        )
      )}

      {tab === 'history' && <SessionHistory />}
    </div>
  )
}
