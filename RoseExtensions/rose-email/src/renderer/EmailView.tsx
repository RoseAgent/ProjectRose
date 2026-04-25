import { useEffect, useState, useRef } from 'react'
import clsx from 'clsx'
import { useEmailStore } from './store'
import { useSettingsStore } from '@renderer/stores/useSettingsStore'
import { useViewStore } from '@renderer/stores/useViewStore'
import styles from './EmailView.module.css'

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

const BUILTIN_FOLDERS = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'spam', name: 'Spam' },
  { id: 'quarantine', name: 'Quarantine' },
]

export function EmailView(): JSX.Element {
  const imapHost = useSettingsStore((s) => s.imapHost)
  const imapUser = useSettingsStore((s) => s.imapUser)
  const setActiveView = useViewStore((s) => s.setActiveView)

  const {
    messages, selectedUid, body, loading, bodyLoading, error,
    activeFolder, filters,
    fetchMessages, fetchMessage, deleteMessage,
    setActiveFolder, moveToFolder, loadFilters, saveFilters
  } = useEmailStore()

  const [contextMenu, setContextMenu] = useState<{ uid: number; x: number; y: number } | null>(null)
  const [newFolderInput, setNewFolderInput] = useState('')
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const isConfigured = Boolean(imapHost && imapUser)

  useEffect(() => {
    if (isConfigured) {
      fetchMessages()
      loadFilters()
    }
  }, [isConfigured])

  useEffect(() => {
    function handleClick(): void { setContextMenu(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const customFolders = filters?.customFolders ?? []
  const allFolders = [...BUILTIN_FOLDERS, ...customFolders]

  const filteredMessages = messages.filter(m => m.folder === activeFolder)
  const selectedMessage = filteredMessages.find((m) => m.uid === selectedUid) ?? null

  function handleSelectMessage(uid: number): void {
    fetchMessage(uid)
  }

  async function handleDelete(): Promise<void> {
    if (selectedUid == null) return
    await deleteMessage(selectedUid)
  }

  function handleRightClick(e: React.MouseEvent, uid: number): void {
    e.preventDefault()
    setContextMenu({ uid, x: e.clientX, y: e.clientY })
  }

  async function handleMoveToFolder(uid: number, folder: string): Promise<void> {
    setContextMenu(null)
    await moveToFolder(uid, folder)
  }

  async function handleAddFolder(): Promise<void> {
    const name = newFolderInput.trim()
    if (!name || !filters) return
    const id = `cf-${Date.now()}`
    const updated = [...(filters.customFolders ?? []), { id, name }]
    await saveFilters({ customFolders: updated })
    setNewFolderInput('')
  }

  async function handleDeleteFolder(id: string): Promise<void> {
    if (!filters) return
    const updated = filters.customFolders.filter(f => f.id !== id)
    await saveFilters({ customFolders: updated })
    // Move messages in deleted folder back to inbox
    const moved = messages
      .filter(m => m.folder === id)
      .map(m => window.api.invoke('rose-email:setMessageFolder', m.uid, 'inbox'))
    await Promise.all(moved)
    if (activeFolder === id) setActiveFolder('inbox')
  }

  function getFolderCount(folderId: string): number {
    return messages.filter(m => m.folder === folderId).length
  }

  if (!isConfigured) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <span>Configure IMAP credentials in Settings to view email.</span>
          <button className={styles.emptyBtn} onClick={() => setActiveView('settings')}>
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarAccount}>{imapUser}</span>
        <button className={styles.toolbarBtn} onClick={() => fetchMessages()} disabled={loading}>
          Refresh
        </button>
        <button
          className={clsx(styles.toolbarBtn, styles.toolbarBtnDanger)}
          onClick={handleDelete}
          disabled={selectedUid == null || loading}
        >
          Delete
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.split}>
        {/* Folder sidebar */}
        <div className={styles.sidebar}>
          {BUILTIN_FOLDERS.map(f => (
            <button
              key={f.id}
              className={clsx(styles.folderItem, activeFolder === f.id && styles.folderItemActive)}
              onClick={() => setActiveFolder(f.id)}
            >
              <span className={styles.folderName}>{f.name}</span>
              {getFolderCount(f.id) > 0 && (
                <span className={styles.folderCount}>{getFolderCount(f.id)}</span>
              )}
            </button>
          ))}

          {customFolders.length > 0 && <div className={styles.folderDivider} />}

          {customFolders.map(f => (
            <div key={f.id} className={clsx(styles.folderItem, activeFolder === f.id && styles.folderItemActive)}>
              <button
                className={styles.folderItemBtn}
                onClick={() => setActiveFolder(f.id)}
              >
                <span className={styles.folderName}>{f.name}</span>
                {getFolderCount(f.id) > 0 && (
                  <span className={styles.folderCount}>{getFolderCount(f.id)}</span>
                )}
              </button>
              <button className={styles.folderDeleteBtn} onClick={() => handleDeleteFolder(f.id)} title="Remove folder">✕</button>
            </div>
          ))}

          <div className={styles.folderDivider} />
          <div className={styles.newFolderRow}>
            <input
              className={styles.newFolderInput}
              placeholder="New folder…"
              value={newFolderInput}
              onChange={e => setNewFolderInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddFolder() }}
            />
            <button className={styles.newFolderBtn} onClick={handleAddFolder} disabled={!newFolderInput.trim()}>+</button>
          </div>
        </div>

        <div className={styles.listPane}>
          <div className={styles.listHeader}>
            {allFolders.find(f => f.id === activeFolder)?.name ?? activeFolder}
          </div>
          {loading ? (
            <div className={styles.spinner}>Loading…</div>
          ) : (
            <div className={styles.list}>
              {filteredMessages.length === 0 && (
                <div className={styles.spinner}>No messages</div>
              )}
              {filteredMessages.map((msg) => (
                <div
                  key={msg.uid}
                  className={clsx(styles.messageRow, selectedUid === msg.uid && styles.messageRowActive)}
                  onClick={() => handleSelectMessage(msg.uid)}
                  onContextMenu={e => handleRightClick(e, msg.uid)}
                >
                  <div className={styles.messageSubjectRow}>
                    {msg.injectionDetected && <span className={styles.injectionBadge} title="Potential prompt injection">⚠</span>}
                    {msg.urlhausDetected && <span className={styles.injectionBadge} title="Sender domain blocked by URLhaus (malware/phishing)">☣</span>}
                    <span className={clsx(styles.messageSubject, !msg.read && styles.messageSubjectUnread)}>
                      {msg.subject}
                    </span>
                  </div>
                  <div className={styles.messageMeta}>
                    {msg.from} · {formatDate(msg.date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.bodyPane}>
          {selectedMessage ? (
            <>
              <div className={styles.bodyHeader}>
                <div className={styles.bodyHeaderSubject}>{selectedMessage.subject}</div>
                <div className={styles.bodyHeaderRow}>
                  <span className={styles.bodyHeaderLabel}>From</span>
                  <span className={styles.bodyHeaderValue}>{selectedMessage.from}</span>
                </div>
                <div className={styles.bodyHeaderRow}>
                  <span className={styles.bodyHeaderLabel}>Date</span>
                  <span className={styles.bodyHeaderValue}>{formatDate(selectedMessage.date)}</span>
                </div>
              </div>
              <div className={styles.bodyScroll}>
                {bodyLoading ? (
                  <div className={styles.spinner}>Loading…</div>
                ) : (
                  <pre className={styles.bodyText}>{body ?? ''}</pre>
                )}
              </div>
            </>
          ) : (
            <div className={styles.bodyEmpty}>Select a message to read it</div>
          )}
        </div>
      </div>

      {/* Context menu for folder assignment */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className={styles.contextMenuLabel}>Move to folder</div>
          {allFolders
            .filter(f => f.id !== messages.find(m => m.uid === contextMenu.uid)?.folder)
            .map(f => (
              <button
                key={f.id}
                className={styles.contextMenuItem}
                onClick={() => handleMoveToFolder(contextMenu.uid, f.id)}
              >
                {f.name}
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}
