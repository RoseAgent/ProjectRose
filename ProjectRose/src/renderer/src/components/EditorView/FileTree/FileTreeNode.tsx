import { useRef, useEffect } from 'react'
import type { FileNode } from '../../../../../shared/types'
import { useProjectStore } from '../../../stores/useProjectStore'
import styles from './FileTree.module.css'
import clsx from 'clsx'

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  onFileClick: (filePath: string) => void
  onContextMenu: (node: FileNode, x: number, y: number) => void
  renamingPath: string | null
  onRenameCommit: (node: FileNode, newName: string) => void
  onRenameCancel: () => void
}

export function FileTreeNode({
  node,
  depth,
  onFileClick,
  onContextMenu,
  renamingPath,
  onRenameCommit,
  onRenameCancel,
}: FileTreeNodeProps): JSX.Element {
  const expandedDirs = useProjectStore((s) => s.expandedDirs)
  const toggleDirExpanded = useProjectStore((s) => s.toggleDirExpanded)
  const isExpanded = expandedDirs.has(node.path)
  const renameRef = useRef<HTMLInputElement>(null)
  const isRenaming = renamingPath === node.path

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus()
  }, [isRenaming])

  const handleClick = (): void => {
    if (isRenaming) return
    if (node.isDirectory) {
      toggleDirExpanded(node.path)
    } else {
      onFileClick(node.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(node, e.clientX, e.clientY)
  }

  return (
    <>
      <div
        className={clsx(styles.node, node.isDirectory && styles.directory)}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <span className={styles.icon}>
          {node.isDirectory ? (isExpanded ? '▾' : '▸') : ' '}
        </span>
        {isRenaming ? (
          <input
            ref={renameRef}
            className={styles.renameInput}
            defaultValue={node.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => onRenameCommit(node, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit(node, (e.target as HTMLInputElement).value)
              if (e.key === 'Escape') { e.stopPropagation(); onRenameCancel() }
            }}
          />
        ) : (
          <span className={styles.name}>{node.name}</span>
        )}
      </div>
      {node.isDirectory && isExpanded && node.children && (
        <>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </>
      )}
    </>
  )
}
