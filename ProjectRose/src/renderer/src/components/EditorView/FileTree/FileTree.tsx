import { useProjectStore } from '../../../stores/useProjectStore'
import { FileTreeNode } from './FileTreeNode'
import styles from './FileTree.module.css'

interface FileTreeProps {
  onFileClick: (filePath: string) => void
}

export function FileTree({ onFileClick }: FileTreeProps): JSX.Element {
  const fileTree = useProjectStore((s) => s.fileTree)

  if (!fileTree) {
    return (
      <div className={styles.fileTree}>
        <div className={styles.empty}>Open a folder to get started</div>
      </div>
    )
  }

  return (
    <div className={styles.fileTree}>
      <div className={styles.header}>Explorer</div>
      {fileTree.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={0}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  )
}
