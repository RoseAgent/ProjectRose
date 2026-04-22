import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { FileNode } from '../../../../../shared/types'
import styles from './ContextMenu.module.css'

interface ContextMenuProps {
  x: number
  y: number
  node: FileNode
  onClose: () => void
  onNewFile: (parentPath: string) => void
  onNewFolder: (parentPath: string) => void
  onRename: (node: FileNode) => void
  onDelete: (node: FileNode) => void
  onRefresh: () => void
}

export function ContextMenu({
  x, y, node, onClose, onNewFile, onNewFolder, onRename, onDelete, onRefresh
}: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const parentPath = node.isDirectory ? node.path : node.path.replace(/[\\/][^\\/]+$/, '')

  const items = [
    ...(node.isDirectory ? [
      { label: 'New File', action: () => { onNewFile(parentPath); onClose() } },
      { label: 'New Folder', action: () => { onNewFolder(parentPath); onClose() } },
      null,
    ] : []),
    { label: 'Rename', action: () => { onRename(node); onClose() } },
    { label: 'Delete', action: () => { onDelete(node); onClose() }, danger: true },
    null,
    { label: 'Refresh Explorer', action: () => { onRefresh(); onClose() } },
  ]

  return createPortal(
    <div ref={ref} className={styles.menu} style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item === null
          ? <div key={i} className={styles.divider} />
          : (
            <button
              key={item.label}
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              onClick={item.action}
            >
              {item.label}
            </button>
          )
      )}
    </div>,
    document.body
  )
}
