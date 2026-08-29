import { useChat, COMPRESSION_THRESHOLD_PCT } from '../../stores/useChat'
import { ModelPicker } from './ModelPicker'
import styles from './ContextStatusBar.module.css'

/**
 * The composer status row: ModelPicker on the left, context/tool-call
 * metrics plus the COMPRESS action on the right. The metrics only exist when
 * the current conversation has an active context estimate; the picker always
 * renders so a model can be selected before the first message.
 */
export function ContextStatusBar(): JSX.Element {
  const status = useChat((s) => s.contextStatus)
  const isCompressing = useChat((s) => s.isCompressing)
  const compressNow = useChat((s) => s.compressNow)

  const pct = status ? Math.max(0, Math.min(100, Math.round(status.percentUsed * 100))) : 0
  const high = status ? status.percentUsed >= COMPRESSION_THRESHOLD_PCT : false

  // The manual button compresses the entire conversation (keep 0 recent turns
  // verbatim), unlike the auto-suggested toast which keeps the recent turns.
  const handleCompress = (): void => {
    void compressNow({ full: true })
  }

  return (
    <div className={styles.bar}>
      <ModelPicker />
      {status && (
        <>
          <span className={styles.sep}>·</span>
          <span className={`${styles.metric} ${high ? styles.metricHigh : ''}`}>{pct}% context</span>
          <span className={styles.sep}>·</span>
          <span className={styles.tools}>
            {status.totalToolSteps} tool {status.totalToolSteps === 1 ? 'call' : 'calls'}
          </span>
          <button
            type="button"
            className={styles.btn}
            onClick={handleCompress}
            disabled={isCompressing}
            title="Summarise the whole conversation to free up context"
          >
            {isCompressing ? 'COMPRESSING…' : 'COMPRESS'}
          </button>
        </>
      )}
    </div>
  )
}
