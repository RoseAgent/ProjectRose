import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { useChat } from '../../stores/useChat'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useViewStore } from '../../stores/useViewStore'
import { useAppsDrawerStore } from '../../stores/useAppsDrawerStore'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import { VoiceEnrollmentModal } from './VoiceEnrollmentModal'
import type { ConversationSource, ConversationListItem } from '@shared/conversationGroups'
import styles from './SessionSidebar.module.css'

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'today'
  return d.toISOString().slice(0, 10)
}

function SourceBadge({ source }: { source: ConversationSource }): JSX.Element | null {
  if (source === 'rose') return null // Rose is the default — badge only foreign rows
  const label = source === 'claude-code' ? 'CC' : 'CX'
  const cls = source === 'claude-code' ? styles.badgeClaude : styles.badgeCodex
  return <span className={clsx(styles.badge, cls)}>{label}</span>
}

export function SessionSidebar(): JSX.Element {
  const groups = useChat((s) => s.groups)
  const currentSessionId = useChat((s) => s.currentSessionId)
  const externalView = useChat((s) => s.externalView)
  const searchQuery = useChat((s) => s.searchQuery)
  const setSearchQuery = useChat((s) => s.setSearchQuery)
  const openWorkspacePicker = useChat((s) => s.openWorkspacePicker)
  const switchSession = useChat((s) => s.switchSession)
  const renameSession = useChat((s) => s.renameSession)
  const deleteSession = useChat((s) => s.deleteSession)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const toggleDrawer = useAppsDrawerStore((s) => s.toggle)
  const closeDrawer = useAppsDrawerStore((s) => s.close)

  const isActiveListening = useActiveListeningStore((s) => s.isActive)
  const activeListeningSetupComplete = useSettingsStore((s) => s.activeListeningSetupComplete)
  const [showEnrollment, setShowEnrollment] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Per-group open/closed override; unset means "use the default" (open iff the
  // group holds the active conversation).
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const activeExternalId = externalView?.id ?? null
  const query = searchQuery.toLowerCase()

  // Filter items by title, then drop empty groups.
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.title.toLowerCase().includes(query)) }))
    .filter((g) => g.items.length > 0)

  function isGroupOpen(path: string): boolean {
    if (path in openOverride) return openOverride[path]
    // Default: open only the group holding the active conversation.
    return !!groups
      .find((g) => g.workspacePath === path)
      ?.items.some((i) => i.id === currentSessionId || i.id === activeExternalId)
  }

  function toggleGroup(path: string): void {
    const next = !isGroupOpen(path)
    setOpenOverride((prev) => ({ ...prev, [path]: next }))
  }

  function handleSwitch(item: ConversationListItem): void {
    if (item.id === currentSessionId || item.id === activeExternalId) return
    switchSession(item.id)
  }

  function startRename(item: ConversationListItem, e: React.MouseEvent): void {
    e.stopPropagation()
    setRenamingId(item.id)
    setRenameValue(item.title)
  }

  function commitRename(id: string): void {
    const trimmed = renameValue.trim()
    if (trimmed) renameSession(id, trimmed)
    setRenamingId(null)
  }

  function handleRenameKey(e: React.KeyboardEvent, id: string): void {
    if (e.key === 'Enter') commitRename(id)
    if (e.key === 'Escape') setRenamingId(null)
  }

  function handleDelete(id: string, e: React.MouseEvent): void {
    e.stopPropagation()
    deleteSession(id)
  }

  function handleActiveListening(): void {
    if (isActiveListening) {
      useActiveListeningStore.getState().setActive(false)
      return
    }
    if (!activeListeningSetupComplete) setShowEnrollment(true)
    else useActiveListeningStore.getState().setActive(true)
  }

  return (
    <div className={styles.sidebar}>
      {/* ── top actions ── */}
      <div className={styles.topBtns}>
        <button className={styles.newBtn} onClick={openWorkspacePicker}>
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
        <button className={styles.newBtn} onClick={toggleDrawer}>
          <span>APPS</span>
        </button>
        <button
          className={styles.newBtn}
          onClick={() => {
            closeDrawer()
            setActiveView('settings')
          }}
        >
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

      {/* ── grouped session list ── */}
      <div className={styles.list}>
        {visibleGroups.length === 0 && <div className={styles.empty}>No sessions yet</div>}
        {visibleGroups.map((group) => {
          const groupOpen = isGroupOpen(group.workspacePath)
          return (
            <div key={group.workspacePath} className={styles.group}>
              <button
                className={clsx(styles.groupHeader, !group.existsOnDisk && styles.groupMissing)}
                onClick={() => toggleGroup(group.workspacePath)}
                title={group.workspacePath}
              >
                <span className={styles.groupCaret}>{groupOpen ? '▾' : '▸'}</span>
                <span className={styles.groupName}>{group.name}</span>
                {!group.existsOnDisk && !group.approximatePath && (
                  <span className={styles.missingChip}>missing</span>
                )}
                <span className={styles.groupCount}>{group.items.length}</span>
              </button>

              {groupOpen &&
                group.items.map((item, idx) => {
                  const isActive = item.id === currentSessionId || item.id === activeExternalId
                  const isRose = item.source === 'rose'
                  return (
                    <div
                      key={`${item.source}:${item.id}`}
                      className={clsx(styles.item, isActive && styles.itemActive)}
                      onClick={() => handleSwitch(item)}
                    >
                      <div className={styles.itemHeader}>
                        <span className={clsx(styles.itemNum, isActive && styles.itemNumActive)}>
                          №{String(group.items.length - idx).padStart(2, '0')}
                        </span>
                        <span className={styles.itemDate}>{formatDate(item.updatedAt)}</span>
                        <SourceBadge source={item.source} />
                        {isActive && <span className={styles.itemBadge}>active</span>}
                      </div>
                      {renamingId === item.id ? (
                        <input
                          ref={renameRef}
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(item.id)}
                          onKeyDown={(e) => handleRenameKey(e, item.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className={clsx(styles.itemTitle, isActive && styles.itemTitleActive)}>
                          {item.title}
                        </div>
                      )}
                      {/* External sessions are read-only — no rename/delete. */}
                      {isRose && (
                        <div className={styles.actions}>
                          <button
                            className={styles.actionBtn}
                            onClick={(e) => startRename(item, e)}
                            title="Rename"
                          >
                            ✎
                          </button>
                          <button
                            className={styles.actionBtn}
                            onClick={(e) => handleDelete(item.id, e)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>

      {showEnrollment && <VoiceEnrollmentModal onClose={() => setShowEnrollment(false)} />}
    </div>
  )
}
