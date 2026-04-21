import type { FileNode } from '../../../../../shared/types'
import { useProjectStore } from '../../../stores/useProjectStore'
import styles from './FileTree.module.css'
import clsx from 'clsx'

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  onFileClick: (filePath: string) => void
}

export function FileTreeNode({ node, depth, onFileClick }: FileTreeNodeProps): JSX.Element {
  const expandedDirs = useProjectStore((s) => s.expandedDirs)
  const toggleDirExpanded = useProjectStore((s) => s.toggleDirExpanded)
  const isExpanded = expandedDirs.has(node.path)

  const handleClick = (): void => {
    if (node.isDirectory) {
      toggleDirExpanded(node.path)
    } else {
      onFileClick(node.path)
    }
  }

  return (
    <>
      <div
        className={clsx(styles.node, node.isDirectory && styles.directory)}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        <span className={styles.icon}>
          {node.isDirectory ? (isExpanded ? '\u25BE' : '\u25B8') : ' '}
        </span>
        <span className={styles.name}>{node.name}</span>
      </div>
      {node.isDirectory && isExpanded && node.children && (
        <>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          ))}
        </>
      )}
    </>
  )
}
