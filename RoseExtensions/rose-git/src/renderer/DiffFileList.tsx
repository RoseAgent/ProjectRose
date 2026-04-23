import styles from './GitView.module.css'
import type { GitFileChange } from '@renderer/types/electron'

interface Props {
  files: GitFileChange[]
  activePath: string | null
  onSelect: (path: string) => void
}

function badgeClass(status: GitFileChange['status']): string {
  switch (status) {
    case 'A': return styles.badgeA
    case 'M': return styles.badgeM
    case 'D': return styles.badgeD
    case 'R': return styles.badgeR
    case 'C': return styles.badgeC
    case 'T': return styles.badgeT
    case 'U': return styles.badgeU
    case '?': return styles.badgeQ
    default: return styles.badgeM
  }
}

export function DiffFileList({ files, activePath, onSelect }: Props): JSX.Element {
  return (
    <div className={styles.fileList}>
      {files.length === 0 && (
        <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
          No file changes
        </div>
      )}
      {files.map((f) => (
        <div
          key={f.path}
          className={`${styles.fileRow} ${activePath === f.path ? styles.fileRowActive : ''}`}
          onClick={() => onSelect(f.path)}
        >
          <span className={`${styles.badge} ${badgeClass(f.status)}`}>{f.status}</span>
          <span>{f.path}</span>
        </div>
      ))}
    </div>
  )
}
