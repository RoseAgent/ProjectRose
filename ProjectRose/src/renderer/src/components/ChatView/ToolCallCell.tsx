import { useState } from 'react'
import type { ToolMessage } from '../../stores/useChatStore'
import styles from './ToolCallCell.module.css'

interface ToolCallCellProps {
  message: ToolMessage
  nested?: boolean
}

function formatParams(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params, null, 2)
  } catch {
    return String(params)
  }
}

export function ToolCallCell({ message, nested }: ToolCallCellProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const statusLabel = message.pending
    ? 'running…'
    : message.error
      ? 'error'
      : 'done'

  const statusClass = message.pending
    ? styles.statusPending
    : message.error
      ? styles.statusError
      : styles.statusDone

  return (
    <div className={nested ? styles.cellNested : styles.cell}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.chevron}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.label}>Tool</span>
        <span className={styles.name}>{message.name}</span>
        <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
      </button>
      {expanded && (
        <div className={styles.body}>
          <div className={styles.sectionLabel}>Input</div>
          <pre className={styles.pre}>{formatParams(message.params)}</pre>
          <div className={styles.sectionLabel}>Output</div>
          {message.pending ? (
            <div className={styles.pendingOutput}>Waiting for tool to finish…</div>
          ) : (
            <pre className={`${styles.pre} ${message.error ? styles.preError : ''}`}>
              {message.result ?? ''}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
