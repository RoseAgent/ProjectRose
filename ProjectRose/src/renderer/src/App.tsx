import { useEffect, useCallback, useRef, useState } from 'react'
import { TopBar } from './components/TopBar/TopBar'
import { FileActions } from './components/TopBar/FileActions'
import { EditorView } from './components/EditorView/EditorView'
import { ChatView } from './components/ChatView/ChatView'
import { ChatPanel } from './components/ChatView/ChatPanel'
import { SettingsView } from './components/SettingsView/SettingsView'
import { AccountView } from './components/AccountView/AccountView'
import { AppsDrawer } from './components/AppsDrawer/AppsDrawer'
import { WorkspacePickerModal } from './components/ChatView/WorkspacePickerModal'
import { SetupWizard } from './components/SetupWizard/SetupWizard'
import { BottomDock } from './components/BottomDock/BottomDock'
import { UpdateToast } from './components/UpdateToast'
import { loadDynamicExtensions } from './extensions/registry'
import { useThemeStore } from './stores/useThemeStore'
import { useViewStore } from './stores/useViewStore'
import { useActiveListeningStore } from './stores/useActiveListeningStore'
import { useFileStore } from './stores/useFileStore'
import { useProjectStore } from './stores/useProjectStore'
import { useIndexingStore } from './stores/useIndexingStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useStatusStore } from './stores/useStatusStore'
import { useUpdaterStore } from './stores/useUpdaterStore'
import { useAppsDrawerStore } from './stores/useAppsDrawerStore'
import { useScreenWebcamShare } from './hooks/useScreenWebcamShare'
import { useChat } from './stores/useChat'
import styles from './App.module.css'

function App(): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const activeView = useViewStore((s) => s.activeView)
  const rootPath = useProjectStore((s) => s.rootPath)
  const openFile = useFileStore((s) => s.openFile)
  const saveActiveFile = useFileStore((s) => s.saveActiveFile)
  const createNewFile = useFileStore((s) => s.createNewFile)
  const refreshTree = useProjectStore((s) => s.refreshTree)
  const toggleTerminal = useViewStore((s) => s.toggleTerminal)
  const workspacePickerOpen = useChat((s) => s.workspacePickerOpen)
  const externalView = useChat((s) => s.externalView)

  const { load: loadSettings } = useSettingsStore()
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const agentStartsExpanded = useSettingsStore((s) => s.agentStartsExpanded)
  const isChatFullWidth = useViewStore((s) => s.isChatFullWidth)
  const [needsSetup, setNeedsSetup] = useState(false)
  const initialExpandApplied = useRef(false)
  const initialMainViewApplied = useRef(false)

  // Bridge: when the agent invokes the `screenshot` tool, capture a frame from
  // the active share stream and send it back to main. The sessionId rides on
  // the request from main so the result can be routed back to the same
  // ChatSession; the renderer doesn't need to know about session stores.
  useEffect(() => {
    return window.api.onAiCaptureScreenshot(async ({ requestId, sessionId }) => {
      const share = useScreenWebcamShare.getState()
      if (share.mode === 'off') {
        await window.api.aiCaptureScreenshotResult(sessionId, requestId, {
          ok: false,
          reason: 'The user is not currently sharing a screen, window, or camera. Ask them to enable screen-share or camera in the chat composer first.'
        })
        return
      }
      const frame = await share.captureFrame()
      if (!frame) {
        await window.api.aiCaptureScreenshotResult(sessionId, requestId, {
          ok: false,
          reason: 'Capture failed (stream not ready).'
        })
        return
      }
      await window.api.aiCaptureScreenshotResult(sessionId, requestId, {
        ok: true,
        dataUrl: frame.dataUrl,
        mode: frame.kind,
        sourceLabel: share.sourceLabel
      })
    })
  }, [])

  // Reset stale activeView (e.g. an extension id persisted from a prior version
  // when extensions still rendered as the main view). The drawer now owns
  // extensions; the main view only renders the four built-ins.
  useEffect(() => {
    const v = useViewStore.getState().activeView
    if (v !== 'editor' && v !== 'chat' && v !== 'settings' && v !== 'account') {
      useViewStore.getState().setActiveView('chat')
    }
  }, [])

  // Auto-bind hostMode to sign-in state. Precedence: ProjectRose sign-in →
  // managed endpoint; else Kimi sign-in → Kimi Code; else fall back to
  // self-hosted Ollama. Reconciles on launch and on every auth change, so
  // signing out of one provider drops through to the next.
  useEffect(() => {
    if (!settingsLoaded) return
    let cancelled = false
    const loggedIn = { pr: false, kimi: false }
    const sync = (): void => {
      const desired: 'projectrose' | 'kimi' | 'self' =
        loggedIn.pr ? 'projectrose' : loggedIn.kimi ? 'kimi' : 'self'
      const current = useSettingsStore.getState().hostMode
      if (current !== desired) {
        useSettingsStore.getState().update({ hostMode: desired }).catch(() => {})
      }
    }
    Promise.all([
      window.api.auth.getStatus().catch(() => ({ loggedIn: false })),
      window.api.kimiAuth.getStatus().catch(() => ({ loggedIn: false }))
    ]).then(([pr, kimi]) => {
      if (cancelled) return
      loggedIn.pr = pr.loggedIn
      loggedIn.kimi = kimi.loggedIn
      sync()
    })
    const offPr = window.api.auth.onChanged((d) => { loggedIn.pr = d.loggedIn; sync() })
    const offKimi = window.api.kimiAuth.onChanged((d) => { loggedIn.kimi = d.loggedIn; sync() })
    return () => { cancelled = true; offPr(); offKimi() }
  }, [settingsLoaded])

  // Load dynamic (third-party) extensions whenever the project changes
  useEffect(() => {
    loadDynamicExtensions(rootPath ?? '').catch(console.error)
  }, [rootPath])

  // Load the global grouped conversation list once on mount. This binds the
  // most recent Rose conversation's Workspace and hydrates its timeline —
  // there is no launch-time Workspace gate anymore (see ADR 0016).
  useEffect(() => {
    useChat.getState().loadAllConversations().catch(console.error)
  }, [])

  // Load persisted settings on mount
  useEffect(() => { loadSettings() }, [loadSettings])

  // Reload settings when a project is opened to merge in repo config
  useEffect(() => { if (rootPath) loadSettings() }, [rootPath, loadSettings])

  // First time settings finish loading, seed the agent view's expanded state
  // from the user's preference. After this point the user can toggle in-session
  // without us clobbering their choice.
  useEffect(() => {
    if (!settingsLoaded || initialExpandApplied.current) return
    initialExpandApplied.current = true
    if (agentStartsExpanded) {
      useViewStore.setState({ isChatFullWidth: true })
    }
  }, [settingsLoaded, agentStartsExpanded])

  // Restore the user's last bloom/editor choice on first settings load. Runs
  // after the stale-activeView reset above (which narrows to base views but
  // doesn't know about the persisted preference).
  useEffect(() => {
    if (!settingsLoaded || initialMainViewApplied.current) return
    initialMainViewApplied.current = true
    const lastMainView = useSettingsStore.getState().lastMainView
    const desired = lastMainView === 'editor' ? 'editor' : 'chat'
    if (useViewStore.getState().activeView !== desired) {
      useViewStore.getState().setActiveView(desired)
    }
  }, [settingsLoaded])

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

  // Subscribe once to status notifications from the main process (e.g. extensions).
  useEffect(() => {
    const cleanup = window.api.onStatusNotify(({ text, tone, durationMs }) => {
      useStatusStore.getState().notify(text, { tone, durationMs })
    })
    return cleanup
  }, [])

  // Subscribe once to auto-updater events from the main process.
  useEffect(() => {
    const store = useUpdaterStore.getState
    const cleanups = [
      window.api.updater.onAvailable((info) => store().setAvailable(info)),
      window.api.updater.onProgress((info) => store().setProgress(info.percent)),
      window.api.updater.onDownloaded((info) => store().setDownloaded(info)),
      window.api.updater.onError((info) => store().setError(info.message))
    ]
    return () => cleanups.forEach((c) => c())
  }, [])

  // Check for ROSE.md when a project is opened; trigger wizard if missing.
  // If already initialized, ensure scaffold directories exist (recreates any that were deleted).
  useEffect(() => {
    // Always start with the apps drawer closed when the rootPath changes —
    // the store survives across mounts, so without this an open value can
    // leak from a previous session into a freshly opened project.
    useAppsDrawerStore.getState().close()

    if (!rootPath) {
      setNeedsSetup(false)
      return
    }
    // Don't scaffold a folder we're only viewing read-only (an external
    // session's workspace) or one that's missing on disk — that would create
    // .projectrose/ in a folder the user never chose for a Rose conversation.
    if (externalView || useProjectStore.getState().workspaceMissing) {
      setNeedsSetup(false)
      return
    }
    // The workspace scaffold (.projectrose/heartbeat/...) is workspace-scoped
    // and must exist regardless of whether the agent has been initialised.
    // Run it unconditionally; checkRoseMd only governs whether the SetupWizard
    // appears for first-time agent identity.
    window.api.ensureScaffold(rootPath).catch(() => {})
    window.api.checkRoseMd(rootPath).then((hasMd) => {
      setNeedsSetup(!hasMd)
    })
  }, [rootPath, externalView])

  // Poll the file tree every minute to catch external changes.
  useEffect(() => {
    if (!rootPath) return
    const interval = setInterval(() => refreshTree(), 60 * 1000)
    return () => clearInterval(interval)
  }, [rootPath, refreshTree])

  // File → Open Folder starts a fresh conversation bound to the chosen folder.
  const handleOpenFolder = useCallback(async () => {
    const path = await window.api.openFolderDialog()
    if (path) useChat.getState().startNewConversation(path)
  }, [])

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
      window.api.onMenuSave(() => saveActiveFile()),
      window.api.onTrayOpenChat(() => useViewStore.getState().setActiveView('chat')),
      window.api.onTrayToggleListening(() => {
        const s = useActiveListeningStore.getState()
        s.setActive(!s.isActive)
      })
    ]
    return () => cleanups.forEach((c) => c())
  }, [createNewFile, handleOpenFile, handleOpenFolder, saveActiveFile])

  // Push isActive changes to main so the tray icon/menu stay in sync. Also
  // fire once on mount so a freshly-opened tray reflects the current value.
  useEffect(() => {
    window.api.notifyListeningStateChanged(useActiveListeningStore.getState().isActive)
    return useActiveListeningStore.subscribe((state, prev) => {
      if (state.isActive !== prev.isActive) {
        window.api.notifyListeningStateChanged(state.isActive)
      }
    })
  }, [])

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

  return (
    <div className={styles.app}>
      <div className={styles.titleBar} />
      <TopBar />
      {needsSetup && rootPath && (
        <SetupWizard
          rootPath={rootPath}
          onComplete={() => { setNeedsSetup(false); refreshTree() }}
        />
      )}
      {workspacePickerOpen && <WorkspacePickerModal />}
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
      <main className={`${styles.mainContent} ${activeView === 'chat' ? styles.mainContentChat : ''} ${activeView === 'settings' ? styles.mainContentSettings : ''} ${activeView === 'editor' ? styles.mainContentEditor : ''} ${activeView === 'editor' && isChatFullWidth ? styles.mainContentEditorFullWidth : ''}`}>
        {!(activeView === 'editor' && isChatFullWidth) && (
          <div className={styles.viewArea}>
            {activeView === 'editor' && <EditorView />}
            {activeView === 'chat' && <ChatView />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'account' && <AccountView />}
          </div>
        )}
        {activeView !== 'chat' && activeView !== 'settings' && <ChatPanel />}
      </main>
      <AppsDrawer />
      <BottomDock />
      <UpdateToast />
    </div>
  )
}

export default App
