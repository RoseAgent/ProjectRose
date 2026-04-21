import clsx from 'clsx'
import styles from './Tab.module.css'

interface TabProps {
  fileName: string
  isActive: boolean
  isDirty: boolean
  tabIndex: number
  onClick: () => void
  onClose: (e: React.MouseEvent) => void
}

export function Tab({ fileName, isActive, isDirty, tabIndex, onClick, onClose }: TabProps): JSX.Element {
  return (
    <div className={clsx(styles.tab, isActive && styles.active)} onClick={onClick}>
      <span className={styles.specimenNum}>№{String(tabIndex + 1).padStart(2, '0')}</span>
      {isDirty && <span className={styles.dirty} />}
      <span className={styles.name}>{fileName}</span>
      <button className={styles.closeBtn} onClick={onClose} title="Close">
        &times;
      </button>
    </div>
  )
}
