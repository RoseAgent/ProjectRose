import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { useChatStore, SessionMeta } from '../../stores/useChatStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import { VoiceEnrollmentModal } from './VoiceEnrollmentModal'
import styles from './SessionSidebar.module.css'

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'today'
  return d.toISOString().slice(0, 10)
}

export function SessionSidebar(): JSX.Element {
  const sessions = useChatStore((s) => s.sessions)
  const currentSessionId = useChatStore((s) => s.currentSessionId)
  const messages = useChatStore((s) => s.messages)
  const searchQuery = useChatStore((s) => s.searchQuery)
  const { setSearchQuery, newSession, switchSession, renameSession, deleteSession } = useChatStore.getState()
  const rootPath = useProjectStore((s) => s.rootPath)
  const agentName = useSettingsStore((s) => s.agentName)
  const defaultModelId = useSettingsStore((s) => s.defaultModelId)
  const models = useSettingsStore((s) => s.models)
  const theme = useThemeStore((s) => s.theme)

  const isActiveListening = useActiveListeningStore((s) => s.isActive)
  const activeListeningSetupComplete = useSettingsStore((s) => s.activeListeningSetupComplete)
  const [showEnrollment, setShowEnrollment] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeModel = models.find((m) => m.id === defaultModelId)
  const modelLabel = activeModel?.displayName ?? activeModel?.modelName ?? '—'
  const contextCount = messages.length

  function handleNewSession(): void {
    newSession()
  }

  function handleSwitch(sess: SessionMeta): void {
    if (!rootPath || sess.id === currentSessionId) return
    switchSession(rootPath, sess.id)
  }

  function startRename(sess: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation()
    setRenamingId(sess.id)
    setRenameValue(sess.title)
  }

  function commitRename(sessId: string): void {
    if (!rootPath) return
    const trimmed = renameValue.trim()
    if (trimmed) renameSession(rootPath, sessId, trimmed)
    setRenamingId(null)
  }

  function handleRenameKey(e: React.KeyboardEvent, sessId: string): void {
    if (e.key === 'Enter') commitRename(sessId)
    if (e.key === 'Escape') setRenamingId(null)
  }

  function handleDelete(sessId: string, e: React.MouseEvent): void {
    e.stopPropagation()
    if (!rootPath) return
    deleteSession(rootPath, sessId)
  }

  function handleActiveListening(): void {
    if (isActiveListening) {
      useActiveListeningStore.getState().setActive(false)
      return
    }
    if (!activeListeningSetupComplete) {
      setShowEnrollment(true)
    } else {
      useActiveListeningStore.getState().setActive(true)
    }
  }

  return (
    <div className={styles.sidebar}>
      {/* ── specimen card ── */}
      <div className={styles.specimenCard}>
        <div className={styles.specimenLabel}>SPECIMEN · AGENT</div>
        <div className={styles.specimenName}>{agentName || 'Rose Agent'}</div>
        <div className={styles.specimenSub}>Rosa × cogitans · v0.1</div>
        <div className={styles.specimenProps}>
          {[
            ['MODEL',   modelLabel],
            ['CONTEXT', contextCount > 0 ? `${contextCount} messages` : '—'],
            ['THEME',   theme === 'herbarium' ? 'paper' : 'dark'],
          ].map(([k, v]) => (
            <div key={k} className={styles.specimenRow}>
              <span className={styles.specimenKey}>{k}</span>
              <span className={styles.specimenVal}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── sessions header ── */}
      <div className={styles.sectionLabel}>SESSIONS · FIELD LOG</div>

      {/* ── search ── */}
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ── session list ── */}
      <div className={styles.list}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No sessions yet</div>
        )}
        {filtered.map((sess, idx) => {
          const isActive = sess.id === currentSessionId
          return (
            <div
              key={sess.id}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => handleSwitch(sess)}
            >
              <div className={styles.itemHeader}>
                <span className={`${styles.itemNum} ${isActive ? styles.itemNumActive : ''}`}>
                  №{String(filtered.length - idx).padStart(2, '0')}
                </span>
                <span className={styles.itemDate}>{formatDate(sess.updatedAt)}</span>
                {isActive && <span className={styles.itemBadge}>active</span>}
              </div>
              {renamingId === sess.id ? (
                <input
                  ref={renameRef}
                  className={styles.renameInput}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(sess.id)}
                  onKeyDown={(e) => handleRenameKey(e, sess.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className={`${styles.itemTitle} ${isActive ? styles.itemTitleActive : ''}`}>
                  {sess.title}
                </div>
              )}
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={(e) => startRename(sess, e)} title="Rename">✎</button>
                <button className={styles.actionBtn} onClick={(e) => handleDelete(sess.id, e)} title="Delete">✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── bottom buttons ── */}
      <div className={styles.bottomBtns}>
        <button className={styles.newBtn} onClick={handleNewSession}>
          <span>+ NEW SESSION</span>
          <span className={styles.kbd}>⌘N</span>
        </button>
        <button
          className={clsx(styles.activeListeningBtn, isActiveListening && styles.activeListeningBtnOn)}
          onClick={handleActiveListening}
        >
          <span className={clsx(styles.dot, isActiveListening && styles.dotActive)} />
          <span>{isActiveListening ? '● ACTIVE LISTENING' : '+ ACTIVE LISTENING'}</span>
          {!isActiveListening && <span className={styles.kbd}>⌘⇧N</span>}
        </button>
      </div>
      {showEnrollment && (
        <VoiceEnrollmentModal onClose={() => setShowEnrollment(false)} />
      )}
    </div>
  )
}
