import { useEffect } from 'react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useViewStore } from '@renderer/stores/useViewStore'
import { useDockerStore } from '@renderer/stores/useDockerStore'
import { ContainerList } from './ContainerList'
import { DetailPane } from './DetailPane'
import styles from './DockerView.module.css'

export function DockerView(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath)
  const activeView = useViewStore((s) => s.activeView)
  const dockerInstalled = useDockerStore((s) => s.dockerInstalled)
  const composeFiles = useDockerStore((s) => s.composeFiles)
  const containers = useDockerStore((s) => s.containers)
  const init = useDockerStore((s) => s.init)
  const refresh = useDockerStore((s) => s.refresh)

  useEffect(() => {
    if (!rootPath) return
    if (activeView !== 'rose-docker') return
    init(rootPath)
  }, [rootPath, activeView, init])

  useEffect(() => {
    if (activeView !== 'rose-docker' || !rootPath) return
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [activeView, rootPath, refresh])

  if (dockerInstalled === false) {
    return (
      <div className={styles.dockerView}>
        <div className={styles.emptyState} style={{ gridColumn: '1 / -1' }}>
          Docker CLI not found. Install Docker Desktop.
        </div>
      </div>
    )
  }

  if (dockerInstalled === null) {
    return (
      <div className={styles.dockerView}>
        <div className={styles.emptyState} style={{ gridColumn: '1 / -1' }}>Checking Docker...</div>
      </div>
    )
  }

  if (composeFiles.length === 0) {
    return (
      <div className={styles.dockerView}>
        <div className={styles.emptyState} style={{ gridColumn: '1 / -1' }}>
          No docker-compose files found in this project.
        </div>
      </div>
    )
  }

  if (containers.length === 0) {
    return (
      <div className={styles.dockerView}>
        <ContainerList />
        <div className={styles.detail}>
          <div className={styles.emptyState}>
            Run <code>docker compose up -d</code> to start containers.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.dockerView}>
      <ContainerList />
      <DetailPane />
    </div>
  )
}
