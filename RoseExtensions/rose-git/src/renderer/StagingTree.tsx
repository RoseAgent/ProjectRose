import { useMemo, useState } from 'react'
import type { GitFileChange } from '@renderer/types/electron'
import styles from './GitView.module.css'

interface StagingTreeProps {
  files: GitFileChange[]
  side: 'unstaged' | 'staged'
  selectedPath?: string
  selectedSource?: 'working' | 'staged' | 'commit'
  onSelect: (path: string) => void
  onPrimaryAction: (paths: string[]) => void   // stage (unstaged side) or unstage (staged side)
  onDiscard?: (paths: string[]) => void        // unstaged side only
  emptyMessage: string
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  file?: GitFileChange
  children: Map<string, TreeNode>
}

function buildTree(files: GitFileChange[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean)
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      let next = cur.children.get(name)
      if (!next) {
        next = { name, path, isDir: !isLast, children: new Map() }
        cur.children.set(name, next)
      }
      if (isLast) {
        next.isDir = false
        next.file = f
      }
      cur = next
    }
  }
  collapseSingleChildDirs(root)
  return root
}

function collapseSingleChildDirs(node: TreeNode): void {
  // Snapshot entries before mutating; re-adding keys during for-of on a Map
  // re-enters the iterator and can loop forever.
  const entries = Array.from(node.children.entries())
  for (const [originalKey, child] of entries) {
    while (child.isDir && child.children.size === 1) {
      const only = Array.from(child.children.values())[0]
      if (!only.isDir) break
      child.name = `${child.name}/${only.name}`
      child.path = only.path
      child.children = only.children
    }
    if (originalKey !== child.name) {
      node.children.delete(originalKey)
      node.children.set(child.name, child)
    }
    collapseSingleChildDirs(child)
  }
}

function collectFiles(node: TreeNode, out: GitFileChange[]): void {
  if (node.file) out.push(node.file)
  for (const child of node.children.values()) collectFiles(child, out)
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

function sortedChildren(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

interface RowProps {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggleExpanded: (path: string) => void
  side: StagingTreeProps['side']
  selectedPath?: string
  selectedSource?: StagingTreeProps['selectedSource']
  onSelect: StagingTreeProps['onSelect']
  onPrimaryAction: StagingTreeProps['onPrimaryAction']
  onDiscard?: StagingTreeProps['onDiscard']
}

function TreeRow(props: RowProps): JSX.Element {
  const { node, depth, expanded, toggleExpanded, side, selectedPath, selectedSource, onSelect, onPrimaryAction, onDiscard } = props
  const isCollapsed = !expanded.has(node.path)
  const pad = { paddingLeft: `${6 + depth * 14}px` }

  if (node.isDir) {
    const descendants: GitFileChange[] = []
    collectFiles(node, descendants)
    const paths = descendants.map((f) => f.path)
    return (
      <>
        <div
          className={styles.stagingRow}
          style={pad}
          onClick={() => toggleExpanded(node.path)}
        >
          <span style={{ width: 12, display: 'inline-block' }}>{isCollapsed ? '▸' : '▾'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}/</span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{descendants.length}</span>
          <button
            className={styles.btn}
            title={side === 'unstaged' ? 'Stage folder' : 'Unstage folder'}
            onClick={(e) => { e.stopPropagation(); onPrimaryAction(paths) }}
          >
            {side === 'unstaged' ? '+' : '−'}
          </button>
          {onDiscard && (
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              title="Discard folder"
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`Discard changes to ${paths.length} file(s) under ${node.path}/?`)) {
                  onDiscard(paths)
                }
              }}
            >
              ✕
            </button>
          )}
        </div>
        {!isCollapsed && sortedChildren(node).map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            side={side}
            selectedPath={selectedPath}
            selectedSource={selectedSource}
            onSelect={onSelect}
            onPrimaryAction={onPrimaryAction}
            onDiscard={onDiscard}
          />
        ))}
      </>
    )
  }

  const f = node.file!
  const targetSource = side === 'staged' ? 'staged' : 'working'
  const isSelected = selectedPath === f.path && selectedSource === targetSource
  return (
    <div
      className={`${styles.stagingRow} ${isSelected ? styles.stagingRowSelected : ''}`}
      style={pad}
      onClick={() => onSelect(f.path)}
    >
      <span style={{ width: 12, display: 'inline-block' }} />
      <span className={`${styles.badge} ${badgeClass(f.status)}`}>{f.status}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      <button
        className={styles.btn}
        onClick={(e) => { e.stopPropagation(); onPrimaryAction([f.path]) }}
      >
        {side === 'unstaged' ? '+' : '−'}
      </button>
      {onDiscard && (
        <button
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`Discard changes to ${f.path}?`)) onDiscard([f.path])
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function StagingTree(props: StagingTreeProps): JSX.Element {
  const { files, emptyMessage } = props
  const root = useMemo(() => buildTree(files), [files])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggleExpanded = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (files.length === 0) {
    return <div style={{ padding: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>{emptyMessage}</div>
  }

  return (
    <>
      {sortedChildren(root).map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={0}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          side={props.side}
          selectedPath={props.selectedPath}
          selectedSource={props.selectedSource}
          onSelect={props.onSelect}
          onPrimaryAction={props.onPrimaryAction}
          onDiscard={props.onDiscard}
        />
      ))}
    </>
  )
}
