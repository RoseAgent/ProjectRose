import { useIndexingStore } from '../../stores/useIndexingStore'
import styles from './IndexingStatus.module.css'

export function IndexingStatus(): JSX.Element | null {
  const phase = useIndexingStore((s) => s.phase)
  const total = useIndexingStore((s) => s.total)
  const completed = useIndexingStore((s) => s.completed)
  const message = useIndexingStore((s) => s.message)
  const visible = useIndexingStore((s) => s.visible)

  if (!visible) return null

  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const isIndeterminate = phase === 'checking' || total === 0

  const containerClasses = [
    styles.container,
    phase === 'done' ? styles.fadeOut : '',
    phase === 'error' ? styles.error : ''
  ]
    .filter(Boolean)
    .join(' ')

  const fillClasses = [styles.fill, isIndeterminate ? styles.indeterminate : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={containerClasses}>
      <span className={styles.message}>{message}</span>
      <div className={styles.track}>
        <div
          className={fillClasses}
          style={isIndeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
      <span className={styles.percent}>{isIndeterminate ? '…' : `${percent}%`}</span>
    </div>
  )
}
