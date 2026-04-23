import { useState } from 'react'
import { useGitStore } from '@renderer/stores/useGitStore'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import styles from './GitView.module.css'

function relativeDate(ts: number): string {
  if (!ts) return ''
  const d = Date.now() - ts * 1000
  const s = Math.floor(d / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export function HistoryList(): JSX.Element {
  const log = useGitStore((s) => s.log)
  const logHasMore = useGitStore((s) => s.logHasMore)
  const logLoading = useGitStore((s) => s.logLoading)
  const loadMore = useGitStore((s) => s.loadMoreLog)
  const selectedSha = useGitStore((s) => s.selectedSha)
  const selectCommit = useGitStore((s) => s.selectCommit)
  const cherryPick = useGitStore((s) => s.cherryPick)
  const revertOp = useGitStore((s) => s.revert)
  const branchCreate = useGitStore((s) => s.branchCreate)
  const tagCreate = useGitStore((s) => s.tagCreate)

  const [menu, setMenu] = useState<{ x: number; y: number; sha: string } | null>(null)

  const items: ContextMenuItem[] = menu
    ? [
        { label: 'Cherry-pick', onClick: () => cherryPick(menu.sha) },
        { label: 'Revert', onClick: () => revertOp(menu.sha) },
        { separator: true, label: '', onClick: () => {} },
        {
          label: 'Create branch here…',
          onClick: () => {
            const name = window.prompt('New branch name:')
            if (name) branchCreate(name, menu.sha)
          }
        },
        {
          label: 'Create tag here…',
          onClick: () => {
            const name = window.prompt('New tag name:')
            if (name) tagCreate(name, menu.sha)
          }
        }
      ]
    : []

  return (
    <div className={styles.pane}>
      <div className={styles.header}>History</div>
      <div className={styles.scroll}>
        {log.length === 0 && !logLoading && (
          <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 12 }}>
            No commits
          </div>
        )}
        {log.map((c) => (
          <div
            key={c.sha}
            className={`${styles.commitRow} ${selectedSha === c.sha ? styles.commitRowActive : ''}`}
            onClick={() => selectCommit(c.sha)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, sha: c.sha })
            }}
          >
            <div className={styles.commitSubject}>{c.subject || '(no message)'}</div>
            <div className={styles.commitMeta}>
              <span className={styles.shortSha}>{c.shortSha}</span>
              <span>{c.authorName}</span>
              <span>{relativeDate(c.timestamp)}</span>
            </div>
          </div>
        ))}
        {logHasMore && (
          <button className={styles.loadMore} onClick={() => loadMore()} disabled={logLoading}>
            {logLoading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={items} onDismiss={() => setMenu(null)} />
      )}
    </div>
  )
}
