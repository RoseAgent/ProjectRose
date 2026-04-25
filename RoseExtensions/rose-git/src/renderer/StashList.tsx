import { useState } from 'react'
import { useGitStore } from './store'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './GitView.module.css'

export function StashList(): JSX.Element {
  const stashes = useGitStore((s) => s.stashes)
  const stashPush = useGitStore((s) => s.stashPush)
  const stashPop = useGitStore((s) => s.stashPop)
  const stashApply = useGitStore((s) => s.stashApply)
  const stashDrop = useGitStore((s) => s.stashDrop)

  const [confirmDrop, setConfirmDrop] = useState<number | null>(null)

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span>Stashes</span>
        <button
          className={styles.btn}
          onClick={() => {
            const m = window.prompt('Stash message (optional):') || undefined
            stashPush(m)
          }}
        >
          Stash
        </button>
      </div>
      <div className={styles.scroll}>
        {stashes.length === 0 && <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>No stashes</div>}
        {stashes.map((s) => (
          <div key={s.index} className={styles.listRow}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              [{s.index}] {s.message}
            </span>
            <button className={styles.btn} onClick={() => stashApply(s.index)}>Apply</button>
            <button className={styles.btn} onClick={() => stashPop(s.index)}>Pop</button>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setConfirmDrop(s.index)}>Drop</button>
          </div>
        ))}
      </div>
      {confirmDrop !== null && (
        <ConfirmDialog
          title="Drop stash"
          body={`Permanently delete stash@{${confirmDrop}}?`}
          confirmLabel="Drop"
          danger
          onCancel={() => setConfirmDrop(null)}
          onConfirm={() => {
            stashDrop(confirmDrop)
            setConfirmDrop(null)
          }}
        />
      )}
    </div>
  )
}
