import { useFileStore } from '../../stores/useFileStore'
import { useProjectStore } from '../../stores/useProjectStore'
import styles from './Breadcrumbs.module.css'

export function Breadcrumbs(): JSX.Element | null {
  const rootPath = useProjectStore((s) => s.rootPath)
  const activeFilePath = useFileStore((s) => s.activeFilePath)

  if (!rootPath) return null

  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const rootName = normalizedRoot.split('/').pop() || normalizedRoot

  let segments: string[] = []
  if (activeFilePath) {
    const normalized = activeFilePath.replace(/\\/g, '/')
    const rootPrefix = normalizedRoot.toLowerCase() + '/'
    if (normalized.toLowerCase().startsWith(rootPrefix)) {
      segments = normalized.slice(normalizedRoot.length + 1).split('/').filter(Boolean)
    } else {
      segments = [normalized.split('/').pop() || normalized]
    }
  }

  return (
    <div className={styles.breadcrumbs}>
      <span className={styles.root}>{rootName}</span>
      {segments.map((seg, i) => (
        <span key={i} className={styles.group}>
          <span className={styles.separator}>›</span>
          <span className={i === segments.length - 1 ? styles.current : styles.segment}>
            {seg}
          </span>
        </span>
      ))}
    </div>
  )
}
