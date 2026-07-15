import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { useChat } from '../../stores/useChat'
import type { SessionMeta } from '../../types/chatMessages'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useViewStore } from '../../stores/useViewStore'
import { useAppsDrawerStore } from '../../stores/useAppsDrawerStore'
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
  const sessions = useChat((s) => s.sessions)
  const currentSessionId = useChat((s) => s.currentSessionId)
  const searchQuery = useChat((s) => s.searchQuery)
  const setSearchQuery = useChat((s) => s.setSearchQuery)
  const newSession = useChat((s) => s.newSession)
  const switchSession = useChat((s) => s.switchSession)
  const renameSession = useChat((s) => s.renameSession)
  const deleteSession = useChat((s) => s.deleteSession)
  const rootPath = useProjectStore((s) => s.rootPath)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const toggleDrawer = useAppsDrawerStore((s) => s.toggle)
  const closeDrawer = useAppsDrawerStore((s) => s.close)

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

  function handleNewSession(): void {
    newSession()
  }

  function handleApps(): void {
    toggleDrawer()
  }

  function handleSettings(): void {
    closeDrawer()
    setActiveView('settings')
  }

  function handleSwitch(sess: SessionMeta): void {
    if (!rootPath || sess.id === currentSessionId) return
    switchSession(sess.id)
  }

  function startRename(sess: SessionMeta, e: React.MouseEvent): void {
    e.stopPropagation()
    setRenamingId(sess.id)
    setRenameValue(sess.title)
  }

  function commitRename(sessId: string): void {
    if (!rootPath) return
    const trimmed = renameValue.trim()
    if (trimmed) renameSession(sessId, trimmed)
    setRenamingId(null)
  }

  function handleRenameKey(e: React.KeyboardEvent, sessId: string): void {
    if (e.key === 'Enter') commitRename(sessId)
    if (e.key === 'Escape') setRenamingId(null)
  }

  function handleDelete(sessId: string, e: React.MouseEvent): void {
    e.stopPropagation()
    if (!rootPath) return
    deleteSession(sessId)
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
      {/* ── top actions ── */}
      <div className={styles.topBtns}>
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
        <button className={styles.newBtn} onClick={handleApps}>
          <span>APPS</span>
        </button>
        <button className={styles.newBtn} onClick={handleSettings}>
          <span>SETTINGS</span>
        </button>
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

      {showEnrollment && (
        <VoiceEnrollmentModal onClose={() => setShowEnrollment(false)} />
      )}
    </div>
  )
}
