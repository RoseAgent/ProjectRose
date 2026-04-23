import { useMemo, useState } from 'react'
import { useGitStore } from '@renderer/stores/useGitStore'
import { ConfirmDialog } from './ConfirmDialog'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import styles from './GitView.module.css'
import type { GitBranch } from '@renderer/types/electron'

export function BranchList(): JSX.Element {
  const branches = useGitStore((s) => s.branches)
  const remotes = useGitStore((s) => s.remotes)
  const status = useGitStore((s) => s.status)
  const checkout = useGitStore((s) => s.checkout)
  const branchCreate = useGitStore((s) => s.branchCreate)
  const branchDelete = useGitStore((s) => s.branchDelete)
  const branchRename = useGitStore((s) => s.branchRename)
  const merge = useGitStore((s) => s.merge)
  const rebase = useGitStore((s) => s.rebase)
  const push = useGitStore((s) => s.push)

  const [menu, setMenu] = useState<{ x: number; y: number; branch: GitBranch } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ name: string; force: boolean } | null>(null)

  const local = useMemo(() => branches.filter((b) => !b.isRemote), [branches])
  const remote = useMemo(() => branches.filter((b) => b.isRemote), [branches])

  const makeItems = (b: GitBranch): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    items.push({ label: 'Checkout', onClick: () => checkout(b.name), disabled: b.isCurrent })
    if (!b.isRemote) {
      items.push({
        label: 'Rename…',
        onClick: () => {
          const n = window.prompt('New name:', b.name)
          if (n && n !== b.name) branchRename(b.name, n)
        }
      })
      items.push({
        label: 'Delete',
        danger: true,
        disabled: b.isCurrent,
        onClick: () => setConfirmDelete({ name: b.name, force: false })
      })
      items.push({
        label: 'Force delete',
        danger: true,
        disabled: b.isCurrent,
        onClick: () => setConfirmDelete({ name: b.name, force: true })
      })
    }
    items.push({ separator: true, label: '', onClick: () => {} })
    items.push({
      label: `Merge into ${status.currentBranch || 'HEAD'}`,
      onClick: () => merge(b.name),
      disabled: b.isCurrent
    })
    items.push({
      label: `Rebase ${status.currentBranch || 'HEAD'} onto this`,
      onClick: () => rebase(b.name),
      disabled: b.isCurrent
    })
    items.push({ separator: true, label: '', onClick: () => {} })
    items.push({
      label: 'Create branch from here…',
      onClick: () => {
        const name = window.prompt('New branch name:')
        if (name) branchCreate(name, b.name)
      }
    })
    if (!b.isRemote && remotes.length > 0) {
      for (const r of remotes) {
        items.push({
          label: `Push to ${r.name}`,
          onClick: () => push(r.name, b.name)
        })
      }
    }
    return items
  }

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span>Branches</span>
        <button
          className={styles.btn}
          onClick={() => {
            const n = window.prompt('New branch name:')
            if (n) branchCreate(n)
          }}
        >
          New
        </button>
      </div>
      <div className={styles.scroll}>
        <div className={styles.sectionHeading}>Local</div>
        {local.length === 0 && <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>none</div>}
        {local.map((b) => (
          <div
            key={b.name}
            className={`${styles.listRow} ${b.isCurrent ? styles.listRowCurrent : ''}`}
            onClick={() => !b.isCurrent && checkout(b.name)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, branch: b })
            }}
          >
            <span>{b.isCurrent ? '● ' : ''}{b.name}</span>
            {b.upstream && (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>→ {b.upstream}</span>
            )}
          </div>
        ))}
        <div className={styles.sectionHeading}>Remote</div>
        {remote.length === 0 && <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>none</div>}
        {remote.map((b) => (
          <div
            key={b.name}
            className={styles.listRow}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, branch: b })
            }}
          >
            <span>{b.name}</span>
          </div>
        ))}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={makeItems(menu.branch)} onDismiss={() => setMenu(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.force ? 'Force delete branch' : 'Delete branch'}
          body={`Delete branch "${confirmDelete.name}"? This cannot be undone.${confirmDelete.force ? ' Unmerged commits will be lost.' : ''}`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            branchDelete(confirmDelete.name, confirmDelete.force)
            setConfirmDelete(null)
          }}
        />
      )}
    </div>
  )
}
