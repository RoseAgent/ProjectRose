import { useEffect, useCallback, useState } from 'react'
import { TopBar } from './components/TopBar/TopBar'
import { FileActions } from './components/TopBar/FileActions'
import { Breadcrumbs } from './components/Breadcrumbs/Breadcrumbs'
import { EditorView } from './components/EditorView/EditorView'
import { ChatView } from './components/ChatView/ChatView'
import { DockerView } from './components/DockerView/DockerView'
import { GitView } from './components/GitView/GitView'
import { HeartbeatView } from './components/HeartbeatView/HeartbeatView'
import { SettingsView } from './components/SettingsView/SettingsView'
import { WelcomeView } from './components/WelcomeView/WelcomeView'
import { ActiveListeningView } from './components/ActiveListeningView/ActiveListeningView'
import { SetupWizard } from './components/SetupWizard/SetupWizard'
import { useThemeStore } from './stores/useThemeStore'
import { useViewStore } from './stores/useViewStore'
import { useFileStore } from './stores/useFileStore'
import { useProjectStore } from './stores/useProjectStore'
import { useIndexingStore } from './stores/useIndexingStore'
import { useChatStore } from './stores/useChatStore'
import { useSettingsStore } from './stores/useSettingsStore'
import styles from './App.module.css'

function App(): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const activeView = useViewStore((s) => s.activeView)
  const rootPath = useProjectStore((s) => s.rootPath)
  const openFile = useFileStore((s) => s.openFile)
  const saveActiveFile = useFileStore((s) => s.saveActiveFile)
  const createNewFile = useFileStore((s) => s.createNewFile)
  const openFolder = useProjectStore((s) => s.openFolder)
  const refreshTree = useProjectStore((s) => s.refreshTree)
  const toggleTerminal = useViewStore((s) => s.toggleTerminal)

  const { heartbeatEnabled, heartbeatIntervalMinutes, load: loadSettings } = useSettingsStore()
  const [needsSetup, setNeedsSetup] = useState(false)

  // Load persisted settings on mount
  useEffect(() => { loadSettings() }, [loadSettings])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.api.setNativeTheme(theme)
  }, [theme])

  // Subscribe once to indexing progress events from the main process.
  useEffect(() => {
    const cleanup = window.api.onIndexingProgress((p) => {
      useIndexingStore.getState().setProgress(p)
    })
    return cleanup
  }, [])

  // Subscribe to AI tool-call events and reflect them in the chat transcript.
  useEffect(() => {
    const cleanups = [
      window.api.onAiToolCallStart((d) => useChatStore.getState().appendToolStart(d)),
      window.api.onAiToolCallEnd((d) => useChatStore.getState().resolveToolEnd(d))
    ]
    return () => cleanups.forEach((c) => c())
  }, [])

  // Check for ROSE.md when a project is opened; trigger wizard if missing.
  useEffect(() => {
    if (!rootPath) {
      setNeedsSetup(false)
      return
    }
    window.api.checkRoseMd(rootPath).then((hasMd) => setNeedsSetup(!hasMd))
  }, [rootPath])

  // Run heartbeat on project open and then on the configured interval.
  useEffect(() => {
    if (!rootPath || needsSetup || !heartbeatEnabled) return

    window.api.runHeartbeat(rootPath).catch(() => {})

    const interval = setInterval(() => {
      window.api.runHeartbeat(rootPath).catch(() => {})
    }, heartbeatIntervalMinutes * 60 * 1000)

    return () => clearInterval(interval)
  }, [rootPath, needsSetup, heartbeatEnabled, heartbeatIntervalMinutes])

  // Poll the file tree every minute to catch external changes.
  useEffect(() => {
    if (!rootPath) return
    const interval = setInterval(() => refreshTree(), 60 * 1000)
    return () => clearInterval(interval)
  }, [rootPath, refreshTree])

  const handleOpenFolder = useCallback(async () => {
    const path = await window.api.openFolderDialog()
    if (path) openFolder(path)
  }, [openFolder])

  const handleOpenFile = useCallback(async () => {
    const path = await window.api.openFileDialog()
    if (path) openFile(path)
  }, [openFile])

  // Listen for native menu events
  useEffect(() => {
    const cleanups = [
      window.api.onMenuNewFile(() => createNewFile()),
      window.api.onMenuOpenFile(() => handleOpenFile()),
      window.api.onMenuOpenFolder(() => handleOpenFolder()),
      window.api.onMenuSave(() => saveActiveFile())
    ]
    return () => cleanups.forEach((c) => c())
  }, [createNewFile, handleOpenFile, handleOpenFolder, saveActiveFile])

  // Keyboard shortcut for terminal toggle
  useEffect(() => {
    if (!rootPath) return

    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        toggleTerminal()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rootPath, toggleTerminal])

  // Welcome screen when no project is open
  if (!rootPath) {
    return (
      <div className={styles.app}>
        <div className={styles.titleBar}>RoseEditor</div>
        <WelcomeView onOpenFolder={handleOpenFolder} />
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <div className={styles.titleBar}>RoseEditor</div>
      {needsSetup && (
        <SetupWizard
          rootPath={rootPath}
          onComplete={() => { setNeedsSetup(false); refreshTree() }}
        />
      )}
      <div className={styles.toolbar}>
        <FileActions
          onOpenFolder={handleOpenFolder}
          onOpenFile={handleOpenFile}
          onNewFile={createNewFile}
          onSave={saveActiveFile}
        />
      </div>
      <Breadcrumbs />
      <main className={styles.mainContent}>
        {activeView === 'editor' && <EditorView />}
        {activeView === 'chat' && <ChatView />}
        {activeView === 'docker' && <DockerView />}
        {activeView === 'git' && <GitView />}
        {activeView === 'heartbeat' && <HeartbeatView />}
        {activeView === 'settings' && <SettingsView />}
        {activeView === 'activeListening' && <ActiveListeningView />}
      </main>
      <TopBar />
    </div>
  )
}

export default App
