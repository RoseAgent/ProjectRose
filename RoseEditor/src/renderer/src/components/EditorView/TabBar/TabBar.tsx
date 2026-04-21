import { useFileStore } from '../../../stores/useFileStore'
import { Tab } from './Tab'
import styles from './TabBar.module.css'

export function TabBar(): JSX.Element {
  const openFiles = useFileStore((s) => s.openFiles)
  const activeFilePath = useFileStore((s) => s.activeFilePath)
  const setActiveFile = useFileStore((s) => s.setActiveFile)
  const closeFile = useFileStore((s) => s.closeFile)
  const isDirty = useFileStore((s) => s.isDirty)

  if (openFiles.length === 0) {
    return <div className={styles.tabBar}><span className={styles.empty}>No files open</span></div>
  }

  return (
    <div className={styles.tabBar}>
      {openFiles.map((file, index) => (
        <Tab
          key={file.filePath}
          fileName={file.fileName}
          isActive={file.filePath === activeFilePath}
          isDirty={isDirty(file.filePath)}
          tabIndex={index}
          onClick={() => setActiveFile(file.filePath)}
          onClose={(e) => {
            e.stopPropagation()
            closeFile(file.filePath)
          }}
        />
      ))}
    </div>
  )
}
