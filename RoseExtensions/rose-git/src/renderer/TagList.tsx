import { useState } from 'react'
import { useGitStore } from '@renderer/stores/useGitStore'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './GitView.module.css'

export function TagList(): JSX.Element {
  const tags = useGitStore((s) => s.tags)
  const tagCreate = useGitStore((s) => s.tagCreate)
  const tagDelete = useGitStore((s) => s.tagDelete)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span>Tags</span>
        <button
          className={styles.btn}
          onClick={() => {
            const n = window.prompt('New tag name:')
            if (!n) return
            const msg = window.prompt('Annotation message (blank for lightweight tag):') || ''
            tagCreate(n, undefined, msg || undefined)
          }}
        >
          New
        </button>
      </div>
      <div className={styles.scroll}>
        {tags.length === 0 && <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>No tags</div>}
        {tags.map((t) => (
          <div key={t.name} className={styles.listRow}>
            <span style={{ flex: 1 }}>{t.name}</span>
            <span className={styles.shortSha}>{t.sha.slice(0, 7)}</span>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => setConfirmDelete(t.name)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete tag"
          body={`Delete tag "${confirmDelete}"?`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            tagDelete(confirmDelete)
            setConfirmDelete(null)
          }}
        />
      )}
    </div>
  )
}
