import { useEffect, useCallback, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { TopBar } from './components/TopBar/TopBar'
import { FileActions } from './components/TopBar/FileActions'
import { EditorView } from './components/EditorView/EditorView'
import { ChatView } from './components/ChatView/ChatView'
import { HeartbeatView } from './components/HeartbeatView/HeartbeatView'
import { SettingsView } from './components/SettingsView/SettingsView'
import { WelcomeView } from './components/WelcomeView/WelcomeView'
import { SetupWizard } from './components/SetupWizard/SetupWizard'
import { getExtensionByViewId } from './extensions/registry'
import { useThemeStore } from './stores/useThemeStore'
import { useViewStore } from './stores/useViewStore'
import { useFileStore } from './stores/useFileStore'
import { useProjectStore } from './stores/useProjectStore'
import { useIndexingStore } from './stores/useIndexingStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useDiscordStore } from './stores/useDiscordStore'
import { useServiceStore } from './stores/useServiceStore'
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

  const { heartbeatEnabled, heartbeatIntervalMinutes, discordBotToken, discordChannels, load: loadSettings } = useSettingsStore()
  const { connect: discordConnect, initEnabledChannels, loadChannels: discordLoadChannels } = useDiscordStore()
  const setServiceStatus = useServiceStore((s) => s.setStatus)
  const [needsSetup, setNeedsSetup] = useState(false)

  // Check service availability at startup
  useEffect(() => {
    window.api.checkServicesHealth().then((results) => {
      const libOk = results.find((r) => r.name === 'RoseLibrary')?.status === 'up'
      const speechOk = results.find((r) => r.name === 'RoseSpeech')?.status === 'up'
      setServiceStatus(libOk, speechOk)
      if (!libOk) toast.warning('RoseLibrary is offline — code search and indexing are unavailable.')
      if (!speechOk) toast.error('RoseSpeech is offline — voice input is unavailable.')
    }).catch(() => {
      setServiceStatus(false, false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted settings on mount
  useEffect(() => { loadSettings() }, [loadSettings])

  // Reload settings when a project is opened to merge in repo config
  useEffect(() => { if (rootPath) loadSettings() }, [rootPath, loadSettings])

  // Auto-connect Discord and sync enabled channels whenever token/channels change
  useEffect(() => {
    initEnabledChannels(discordChannels)
    if (!discordBotToken) return
    discordConnect().then(() => discordLoadChannels()).catch(() => {})
  }, [discordBotToken, discordChannels]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.api.setNativeTheme(theme === 'herbarium' ? 'light' : theme)
  }, [theme])

  // Subscribe once to indexing progress events from the main process.
  useEffect(() => {
    const cleanup = window.api.onIndexingProgress((p) => {
      useIndexingStore.getState().setProgress(p)
    })
    return cleanup
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
        <Toaster position="bottom-right" />
        <div className={styles.titleBar} />
        <WelcomeView onOpenFolder={handleOpenFolder} />
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <Toaster position="bottom-right" />
      <div className={styles.titleBar} />
      <TopBar />
      {needsSetup && (
        <SetupWizard
          rootPath={rootPath}
          onComplete={() => { setNeedsSetup(false); refreshTree() }}
        />
      )}
      {activeView === 'editor' && (
        <div className={styles.toolbar}>
          <FileActions
            onOpenFolder={handleOpenFolder}
            onOpenFile={handleOpenFile}
            onNewFile={createNewFile}
            onSave={saveActiveFile}
          />
        </div>
      )}
      <main className={styles.mainContent}>
        {activeView === 'editor' && <EditorView />}
        {activeView === 'chat' && <ChatView />}
        {activeView === 'heartbeat' && <HeartbeatView />}
        {activeView === 'settings' && <SettingsView />}
        {(() => {
          const ext = getExtensionByViewId(activeView)
          return ext?.PageView ? <ext.PageView /> : null
        })()}
      </main>
    </div>
  )
}

export default App
