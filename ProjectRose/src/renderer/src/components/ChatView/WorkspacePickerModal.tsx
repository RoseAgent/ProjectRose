import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useChat } from '../../stores/useChat'
import { useProjectStore } from '../../stores/useProjectStore'
import type { KnownWorkspace } from '@shared/conversationGroups'
import styles from './WorkspacePickerModal.module.css'

// Lightweight Workspace picker shown when starting a new Conversation. Lists
// known workspaces (recents + conversation groups) newest-first, pre-scrolled
// to the active workspace, plus a Browse… escape hatch. A Conversation always
// gets an explicit Workspace — there is no silent default (ADR 0006 spirit).
export function WorkspacePickerModal(): JSX.Element {
  const closePicker = useChat((s) => s.closeWorkspacePicker)
  const startNewConversation = useChat((s) => s.startNewConversation)
  const activeWorkspace = useProjectStore((s) => s.rootPath)
  const [known, setKnown] = useState<KnownWorkspace[]>([])

  useEffect(() => {
    window.api.workspaces
      .listKnown()
      .then(setKnown)
      .catch(() => setKnown([]))
  }, [])

  async function choose(path: string): Promise<void> {
    await startNewConversation(path)
  }

  async function browse(): Promise<void> {
    const path = await window.api.openFolderDialog()
    if (path) await startNewConversation(path)
  }

  // Active workspace first, then the rest by recency.
  const ordered = [...known].sort((a, b) => {
    if (a.path === activeWorkspace) return -1
    if (b.path === activeWorkspace) return 1
    return b.lastActivity - a.lastActivity
  })

  return (
    <div className={styles.overlay} onClick={closePicker}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={closePicker} title="Close">
          ✕
        </button>
        <div className={styles.title}>New conversation — choose a workspace</div>

        <div className={styles.list}>
          {ordered.length === 0 && (
            <div className={styles.empty}>No known workspaces yet — browse for a folder.</div>
          )}
          {ordered.map((w) => (
            <button
              key={w.path}
              className={clsx(styles.row, !w.existsOnDisk && styles.rowMissing)}
              onClick={() => choose(w.path)}
              disabled={!w.existsOnDisk}
              title={w.path}
            >
              <span className={styles.rowName}>{w.name}</span>
              <span className={styles.rowPath}>{w.path}</span>
              {!w.existsOnDisk && <span className={styles.missingChip}>missing</span>}
            </button>
          ))}
        </div>

        <button className={styles.browseBtn} onClick={browse}>
          Browse for a folder…
        </button>
      </div>
    </div>
  )
}
