import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../../stores/useProjectStore'
import { useFileStore } from '../../../stores/useFileStore'
import { flattenTree, fuzzyMatch, getBasename } from '../../../utils/treeUtils'
import styles from './QuickOpen.module.css'

interface QuickOpenProps {
  onClose: () => void
}

export function QuickOpen({ onClose }: QuickOpenProps): JSX.Element {
  const fileTree = useProjectStore((s) => s.fileTree)
  const openFile = useFileStore((s) => s.openFile)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allFiles = fileTree ? flattenTree(fileTree) : []
  const filtered = allFiles.filter((p) => fuzzyMatch(p, query)).slice(0, 50)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelectedIdx(0) }, [query])

  const commit = useCallback(async (path: string) => {
    await openFile(path)
    onClose()
  }, [openFile, onClose])

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIdx]) commit(filtered[selectedIdx])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Go to file..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div ref={listRef} className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No files found</div>
          )}
          {filtered.map((path, i) => (
            <div
              key={path}
              className={`${styles.item} ${i === selectedIdx ? styles.itemSelected : ''}`}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => commit(path)}
            >
              <span className={styles.filename}>{getBasename(path)}</span>
              <span className={styles.filepath}>{path}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
