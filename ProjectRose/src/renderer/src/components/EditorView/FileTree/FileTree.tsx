import { useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../../../stores/useProjectStore'
import { useFileStore } from '../../../stores/useFileStore'
import { FileTreeNode } from './FileTreeNode'
import { ContextMenu } from './ContextMenu'
import { joinPath } from '../../../utils/pathUtils'
import type { FileNode } from '../../../../../shared/types'
import styles from './FileTree.module.css'

interface FileTreeProps {
  onFileClick: (filePath: string) => void
}

interface ContextMenuState {
  node: FileNode
  x: number
  y: number
}

interface NewEntryState {
  parentPath: string
  kind: 'file' | 'folder'
}


export function FileTree({ onFileClick }: FileTreeProps): JSX.Element {
  const fileTree = useProjectStore((s) => s.fileTree)
  const refreshTree = useProjectStore((s) => s.refreshTree)
  const openFiles = useFileStore((s) => s.openFiles)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [newEntry, setNewEntry] = useState<NewEntryState | null>(null)
  const [newEntryName, setNewEntryName] = useState('')
  const newEntryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (newEntry) {
      setNewEntryName('')
      setTimeout(() => newEntryRef.current?.focus(), 50)
    }
  }, [newEntry])

  async function commitNewEntry(): Promise<void> {
    if (!newEntry || !newEntryName.trim()) { setNewEntry(null); return }
    const fullPath = joinPath(newEntry.parentPath, newEntryName.trim())
    try {
      if (newEntry.kind === 'file') {
        await window.api.createFile(fullPath)
        await refreshTree()
        onFileClick(fullPath)
      } else {
        await window.api.createDirectory(fullPath)
        await refreshTree()
      }
    } catch (err) {
      console.error('Create failed', err)
    }
    setNewEntry(null)
  }

  async function commitRename(node: FileNode, newName: string): Promise<void> {
    setRenamingPath(null)
    const trimmed = newName.trim()
    if (!trimmed || trimmed === node.name) return
    const parentDir = node.path.replace(/[\\/][^\\/]+$/, '')
    const newPath = joinPath(parentDir, trimmed)
    try {
      await window.api.renameFile(node.path, newPath)
      const wasOpen = openFiles.find((f) => f.filePath === node.path)
      if (wasOpen) {
        useFileStore.getState().closeFile(node.path)
        await onFileClick(newPath)
      }
      await refreshTree()
    } catch (err) {
      console.error('Rename failed', err)
    }
  }

  async function handleDelete(node: FileNode): Promise<void> {
    const confirmed = window.confirm(
      `Delete "${node.name}"${node.isDirectory ? ' and all its contents' : ''}?`
    )
    if (!confirmed) return
    try {
      if (node.isDirectory) {
        // Close any open files inside this directory
        const dirPrefix = node.path.replace(/\\/g, '/')
        for (const f of useFileStore.getState().openFiles) {
          if (f.filePath.replace(/\\/g, '/').startsWith(dirPrefix)) {
            useFileStore.getState().closeFile(f.filePath)
          }
        }
        await window.api.deleteDirectory(node.path)
      } else {
        useFileStore.getState().closeFile(node.path)
        await window.api.deleteFile(node.path)
      }
      await refreshTree()
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  if (!fileTree) {
    return (
      <div className={styles.fileTree}>
        <div className={styles.empty}>Open a folder to get started</div>
      </div>
    )
  }

  return (
    <div
      className={styles.fileTree}
      onContextMenu={(e) => {
        // Right-click on empty space in the tree → context menu on root
        if (e.target === e.currentTarget) {
          e.preventDefault()
          setContextMenu({ node: fileTree, x: e.clientX, y: e.clientY })
        }
      }}
    >
      <div className={styles.header}>Explorer</div>

      {newEntry && (
        <div className={styles.node} style={{ paddingLeft: '12px' }}>
          <span className={styles.icon}>{newEntry.kind === 'folder' ? '▸' : ' '}</span>
          <input
            ref={newEntryRef}
            className={styles.newNameInput}
            value={newEntryName}
            onChange={(e) => setNewEntryName(e.target.value)}
            onBlur={commitNewEntry}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewEntry()
              if (e.key === 'Escape') setNewEntry(null)
            }}
            placeholder={newEntry.kind === 'file' ? 'filename.ts' : 'folder-name'}
          />
        </div>
      )}

      {fileTree.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={0}
          onFileClick={onFileClick}
          onContextMenu={(node, x, y) => setContextMenu({ node, x, y })}
          renamingPath={renamingPath}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenamingPath(null)}
        />
      ))}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onNewFile={(parentPath) => setNewEntry({ parentPath, kind: 'file' })}
          onNewFolder={(parentPath) => setNewEntry({ parentPath, kind: 'folder' })}
          onRename={(node) => setRenamingPath(node.path)}
          onDelete={handleDelete}
          onRefresh={refreshTree}
        />
      )}
    </div>
  )
}
