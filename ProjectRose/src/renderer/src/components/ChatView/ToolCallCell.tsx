import { useState } from 'react'
import type { ToolMessage } from '../../stores/useChatStore'
import styles from './ToolCallCell.module.css'

interface ToolCallCellProps {
  message: ToolMessage
  nested?: boolean
}

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }): JSX.Element {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  return (
    <pre className={styles.diff}>
      {oldLines.map((line, i) => (
        <div key={`r${i}`} className={styles.diffRemoved}>
          <span className={styles.diffSign}>-</span>{line}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`a${i}`} className={styles.diffAdded}>
          <span className={styles.diffSign}>+</span>{line}
        </div>
      ))}
    </pre>
  )
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

  const statusLabel = message.pending ? 'running…' : message.error ? 'error' : 'done'
  const statusClass = message.pending
    ? styles.statusPending
    : message.error
      ? styles.statusError
      : styles.statusDone

  const isEditFile = message.name === 'edit_file'
  const isWriteFile = message.name === 'write_file'
  const filePath = (isEditFile || isWriteFile) && typeof message.params.path === 'string'
    ? message.params.path
    : null

  return (
    <div className={nested ? styles.cellNested : styles.cell}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.chevron}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.label}>Tool</span>
        <span className={styles.name}>
          {message.name}
          {filePath && <span className={styles.filePath}>&nbsp;·&nbsp;{filePath}</span>}
        </span>
        <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
      </button>
      {expanded && (
        <div className={styles.body}>
          {isEditFile ? (
            <>
              <div className={styles.sectionLabel}>Diff</div>
              <DiffView
                oldStr={String(message.params.old_string ?? '')}
                newStr={String(message.params.new_string ?? '')}
              />
              {(message.error || message.pending) && (
                <>
                  <div className={styles.sectionLabel}>{message.error ? 'Error' : 'Output'}</div>
                  {message.pending ? (
                    <div className={styles.pendingOutput}>Waiting for tool to finish…</div>
                  ) : (
                    <pre className={`${styles.pre} ${styles.preError}`}>{message.result ?? ''}</pre>
                  )}
                </>
              )}
            </>
          ) : isWriteFile ? (
            <>
              <div className={styles.sectionLabel}>Content</div>
              <pre className={styles.pre}>{String(message.params.content ?? '')}</pre>
              {message.error && (
                <>
                  <div className={styles.sectionLabel}>Error</div>
                  <pre className={`${styles.pre} ${styles.preError}`}>{message.result ?? ''}</pre>
                </>
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
