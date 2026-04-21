import { useState, useRef, useEffect } from 'react'
import { useChatStore, SessionMeta } from '../../stores/useChatStore'
import { useProjectStore } from '../../stores/useProjectStore'
import styles from './SessionSidebar.module.css'

export function SessionSidebar(): JSX.Element {
  const sessions = useChatStore((s) => s.sessions)
  const currentSessionId = useChatStore((s) => s.currentSessionId)
  const searchQuery = useChatStore((s) => s.searchQuery)
  const { setSearchQuery, newSession, switchSession, renameSession, deleteSession } = useChatStore.getState()
  const rootPath = useProjectStore((s) => s.rootPath)

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

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <button className={styles.newBtn} onClick={handleNewSession}>+ New Session</button>
      </div>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className={styles.list}>
        {filtered.length === 0 && (
          <div className={styles.empty}>No sessions yet</div>
        )}
        {filtered.map((sess) => (
          <div
            key={sess.id}
            className={`${styles.item} ${sess.id === currentSessionId ? styles.itemActive : ''}`}
            onClick={() => handleSwitch(sess)}
          >
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
              <span className={styles.title}>{sess.title}</span>
            )}
            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={(e) => startRename(sess, e)} title="Rename">✎</button>
              <button className={styles.actionBtn} onClick={(e) => handleDelete(sess.id, e)} title="Delete">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
