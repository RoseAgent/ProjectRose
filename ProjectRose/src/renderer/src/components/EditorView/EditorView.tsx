import { useEffect } from 'react'
import { toast } from 'sonner'
import { FileTree } from './FileTree/FileTree'
import { TabBar } from './TabBar/TabBar'
import { MonacoEditor } from './MonacoEditor'
import { TerminalPanel } from './Terminal/TerminalPanel'
import { useFileStore } from '../../stores/useFileStore'
import { useViewStore } from '../../stores/useViewStore'
import { useServiceStore } from '../../stores/useServiceStore'
import styles from './EditorView.module.css'

export function EditorView(): JSX.Element {
  const openFile = useFileStore((s) => s.openFile)
  const isTerminalVisible = useViewStore((s) => s.isTerminalVisible)
  const roseLibrary = useServiceStore((s) => s.roseLibrary)

  useEffect(() => {
    if (roseLibrary === false) {
      toast.warning('RoseLibrary is offline — code search and smart features are unavailable.')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
