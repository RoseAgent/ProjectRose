import { useGitStore } from '@renderer/stores/useGitStore'
import styles from './GitView.module.css'

const TABS: Array<{ id: 'history' | 'branches' | 'tags' | 'stashes'; label: string }> = [
  { id: 'history', label: 'History' },
  { id: 'branches', label: 'Branches' },
  { id: 'tags', label: 'Tags' },
  { id: 'stashes', label: 'Stashes' }
]

export function LeftTabs(): JSX.Element {
  const leftTab = useGitStore((s) => s.leftTab)
  const setLeftTab = useGitStore((s) => s.setLeftTab)
  const status = useGitStore((s) => s.status)

  return (
    <div className={styles.pane}>
      {status.currentBranch && (
        <div className={styles.branchBadge}>
          {status.currentBranch}
          {status.ahead || status.behind ? ` (${status.ahead}/${status.behind})` : ''}
        </div>
      )}
      <div className={styles.leftTabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.leftTab} ${leftTab === t.id ? styles.leftTabActive : ''}`}
            onClick={() => setLeftTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
