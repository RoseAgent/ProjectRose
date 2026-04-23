import { useEffect, useRef } from 'react'
import styles from './GitView.module.css'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  separator?: boolean
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onDismiss: () => void
}

export function ContextMenu({ x, y, items, onDismiss }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onDismiss])

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className={styles.contextSeparator} />
        return (
          <div
            key={i}
            className={`${styles.contextItem} ${it.danger ? styles.contextItemDanger : ''}`}
            style={{ opacity: it.disabled ? 0.5 : 1, pointerEvents: it.disabled ? 'none' : 'auto' }}
            onClick={() => {
              if (!it.disabled) {
                it.onClick()
                onDismiss()
              }
            }}
          >
            {it.label}
          </div>
        )
      })}
    </div>
  )
}
