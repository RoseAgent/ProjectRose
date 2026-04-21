import { useState } from 'react'
import type { ToolMessage } from '../../stores/useChatStore'
import { ToolCallCell } from './ToolCallCell'
import styles from './ToolCallGroupCell.module.css'

interface ToolCallGroupCellProps {
  messages: ToolMessage[]
}

export function ToolCallGroupCell({ messages }: ToolCallGroupCellProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const anyPending = messages.some((m) => m.pending)
  const anyError = messages.some((m) => m.error)

  const statusLabel = anyPending ? 'running…' : anyError ? 'error' : 'done'
  const statusClass = anyPending ? styles.statusPending : anyError ? styles.statusError : styles.statusDone

  return (
    <div className={styles.cell}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        <span className={styles.label}>Tool Calls</span>
        <span className={styles.count}>{messages.length}</span>
        <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
      </button>
      {expanded && (
        <div className={styles.body}>
          {messages.map((msg) => (
            <ToolCallCell key={msg.id} message={msg} nested />
          ))}
        </div>
      )}
    </div>
  )
}
