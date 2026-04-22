import { useState, useEffect } from 'react'
import { FileTree } from './FileTree/FileTree'
import { TabBar } from './TabBar/TabBar'
import { MonacoEditor } from './MonacoEditor'
import { TerminalPanel } from './Terminal/TerminalPanel'
import { QuickOpen } from './QuickOpen/QuickOpen'
import { useFileStore } from '../../stores/useFileStore'
import { useViewStore } from '../../stores/useViewStore'
import styles from './EditorView.module.css'

export function EditorView(): JSX.Element {
  const openFile = useFileStore((s) => s.openFile)
  const isTerminalVisible = useViewStore((s) => s.isTerminalVisible)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.altKey && e.key === 'e') {
        e.preventDefault()
        setQuickOpenVisible((v) => !v)
        return
      }
      if (e.ctrlKey && !e.altKey && e.key === 'e') {
        e.preventDefault()
        useFileStore.getState().switchToPreviousFile()
        return
      }
      if (e.ctrlKey && !e.altKey && e.key === 'w') {
        e.preventDefault()
        const active = useFileStore.getState().activeFilePath
        if (active) useFileStore.getState().closeFile(active)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
      {quickOpenVisible && <QuickOpen onClose={() => setQuickOpenVisible(false)} />}
    </div>
  )
}
