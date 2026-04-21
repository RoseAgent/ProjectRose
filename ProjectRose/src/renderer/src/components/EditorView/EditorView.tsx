import { FileTree } from './FileTree/FileTree'
import { TabBar } from './TabBar/TabBar'
import { MonacoEditor } from './MonacoEditor'
import { TerminalPanel } from './Terminal/TerminalPanel'
import { useFileStore } from '../../stores/useFileStore'
import { useViewStore } from '../../stores/useViewStore'
import styles from './EditorView.module.css'

export function EditorView(): JSX.Element {
  const openFile = useFileStore((s) => s.openFile)
  const isTerminalVisible = useViewStore((s) => s.isTerminalVisible)

  return (
    <div className={styles.editorView}>
      <div className={styles.sidebar}>
        <FileTree onFileClick={openFile} />
      </div>
      <div className={styles.editorMain}>
        <TabBar />
        <div className={styles.editorArea}>
          <MonacoEditor />
        </div>
        {isTerminalVisible && <TerminalPanel />}
      </div>
    </div>
  )
}
