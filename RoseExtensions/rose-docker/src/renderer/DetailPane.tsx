import { useDockerStore } from './store'
import { ActionBar } from './ActionBar'
import { LogsTab } from './LogsTab'
import { InspectTab } from './InspectTab'
import { FilesTab } from './FilesTab'
import styles from './DockerView.module.css'

export function DetailPane(): JSX.Element {
  const selectedId = useDockerStore((s) => s.selectedId)
  const activeTab = useDockerStore((s) => s.activeTab)
  const setTab = useDockerStore((s) => s.setTab)
  const container = useDockerStore((s) =>
    s.containers.find((c) => c.id === s.selectedId) ?? null
  )
  const error = useDockerStore((s) => s.error)

  if (!selectedId || !container) {
    return (
      <div className={styles.detail}>
        <div className={styles.emptyState}>Select a container to view details</div>
      </div>
    )
  }

  return (
    <div className={styles.detail}>
      <ActionBar container={container} />
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.tabBar}>
        <button
          className={activeTab === 'logs' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('logs')}
        >Logs</button>
        <button
          className={activeTab === 'inspect' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('inspect')}
        >Inspect</button>
        <button
          className={activeTab === 'files' ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
          onClick={() => setTab('files')}
        >Files</button>
      </div>
      <div className={styles.tabContent}>
        {activeTab === 'logs' && <LogsTab key={selectedId} containerId={selectedId} />}
        {activeTab === 'inspect' && <InspectTab key={selectedId} containerId={selectedId} />}
        {activeTab === 'files' && <FilesTab key={selectedId} containerId={selectedId} />}
      </div>
    </div>
  )
}
