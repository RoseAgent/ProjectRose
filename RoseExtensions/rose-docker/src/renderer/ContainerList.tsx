import { useMemo } from 'react'
import { useDockerStore } from './store'
import type { DockerContainer } from './store'
import styles from './DockerView.module.css'

function statusClass(state: string): string {
  const s = state.toLowerCase()
  if (s === 'running') return styles.statusRunning
  if (s === 'exited' || s === 'created' || s === 'stopped' || s === 'dead') return styles.statusExited
  if (s === 'paused' || s === 'restarting') return styles.statusPaused
  return styles.statusOther
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export function ContainerList(): JSX.Element {
  const containers = useDockerStore((s) => s.containers)
  const composeFiles = useDockerStore((s) => s.composeFiles)
  const selectedId = useDockerStore((s) => s.selectedId)
  const select = useDockerStore((s) => s.select)

  const grouped = useMemo(() => {
    const map = new Map<string, DockerContainer[]>()
    for (const file of composeFiles) map.set(file, [])
    for (const c of containers) {
      const key = c.composeFile ?? '(unassigned)'
      const arr = map.get(key) ?? []
      arr.push(c)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [containers, composeFiles])

  return (
    <div className={styles.sidebar}>
      {grouped.map(([file, list]) => (
        <div key={file}>
          <div className={styles.groupHeader}>{basename(file)}</div>
          {list.length === 0 ? (
            <div className={styles.placeholder}>No containers</div>
          ) : (
            list.map((c) => (
              <div
                key={c.id}
                className={
                  selectedId === c.id
                    ? `${styles.containerItem} ${styles.containerItemActive}`
                    : styles.containerItem
                }
                onClick={() => select(c.id)}
              >
                <div className={styles.containerName}>{c.name || c.id.slice(0, 12)}</div>
                <div className={styles.containerMeta}>
                  <span className={`${styles.statusBadge} ${statusClass(c.state)}`}>{c.state || 'unknown'}</span>
                  <span>{c.service || c.image}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}
