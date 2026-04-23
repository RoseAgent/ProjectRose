import { useDockerStore } from '@renderer/stores/useDockerStore'
import type { DockerContainer } from '@renderer/types/electron'
import styles from './DockerView.module.css'

interface Props {
  container: DockerContainer
}

export function ActionBar({ container }: Props): JSX.Element {
  const runAction = useDockerStore((s) => s.runAction)
  const loading = useDockerStore((s) => s.loading)
  const state = (container.state || '').toLowerCase()
  const isRunning = state === 'running'
  const canStart = !isRunning && state !== 'restarting'

  return (
    <div className={styles.actionBar}>
      <button
        className={styles.actionBtn}
        disabled={loading || !canStart}
        onClick={() => runAction(container.id, 'start')}
      >
        Start
      </button>
      <button
        className={styles.actionBtn}
        disabled={loading || !isRunning}
        onClick={() => runAction(container.id, 'stop')}
      >
        Stop
      </button>
      <button
        className={styles.actionBtn}
        disabled={loading || !isRunning}
        onClick={() => runAction(container.id, 'restart')}
      >
        Restart
      </button>
      <span className={styles.detailTitle}>
        {container.name || container.id.slice(0, 12)} · {container.status || container.state}
      </span>
    </div>
  )
}
