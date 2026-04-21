import styles from './TopBar.module.css'

interface FileActionsProps {
  onOpenFolder: () => void
  onOpenFile: () => void
  onNewFile: () => void
  onSave: () => void
}

export function FileActions({
  onOpenFolder,
  onOpenFile,
  onNewFile,
  onSave
}: FileActionsProps): JSX.Element {
  return (
    <div className={styles.fileActions}>
      <button className={styles.actionButton} onClick={onOpenFolder} title="Open Folder">
        Open Folder
      </button>
      <button className={styles.actionButton} onClick={onOpenFile} title="Open File (Ctrl+O)">
        Open
      </button>
      <button className={styles.actionButton} onClick={onNewFile} title="New File (Ctrl+N)">
        New
      </button>
      <button className={styles.actionButton} onClick={onSave} title="Save (Ctrl+S)">
        Save
      </button>
    </div>
  )
}
