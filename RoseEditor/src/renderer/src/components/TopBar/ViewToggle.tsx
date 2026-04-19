import { useViewStore } from '../../stores/useViewStore'
import clsx from 'clsx'
import styles from './TopBar.module.css'

export function ViewToggle(): JSX.Element {
  const activeView = useViewStore((s) => s.activeView)
  const setActiveView = useViewStore((s) => s.setActiveView)

  return (
    <div className={styles.toggleGroup}>
      <button
        className={clsx(styles.toggleBtn, activeView === 'chat' && styles.toggleActive)}
        onClick={() => setActiveView('chat')}
      >
        Chat
      </button>
      <button
        className={clsx(styles.toggleBtn, activeView === 'docker' && styles.toggleActive)}
        onClick={() => setActiveView('docker')}
      >
        Docker
      </button>
      <button
        className={clsx(styles.toggleBtn, activeView === 'git' && styles.toggleActive)}
        onClick={() => setActiveView('git')}
      >
        Git
      </button>
      <button
        className={clsx(styles.toggleBtn, activeView === 'editor' && styles.toggleActive)}
        onClick={() => setActiveView('editor')}
      >
        Editor
      </button>
    </div>
  )
}
