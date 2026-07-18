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
import { useProviderStore } from './stores/useProviderStore'
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
  const isChatFullWidth = useViewStore((s) => s.isChatFullWidth)
  const [needsSetup, setNeedsSetup] = useState(false)
  const initialMainViewApplied = useRef(false)

  // Keep EditorView and ChatView mounted once they've been shown, then just
  // toggle their visibility. Unmounting EditorView would kill the terminal's
  // pty + xterm scrollback, and swapping ChatView in/out drops the chat scroll
  // position — this preserves both across editor↔bloom switches. We lazy-mount
  // (rather than mounting both on boot) so the editor's pty isn't spawned until
  // the user actually visits the editor. 'chat' is the initial view.
  const [viewMounted, setViewMounted] = useState({ editor: false, chat: true })
  useEffect(() => {
    if (activeView === 'editor') setViewMounted((m) => (m.editor ? m : { ...m, editor: true }))
    else if (activeView === 'chat') setViewMounted((m) => (m.chat ? m : { ...m, chat: true }))
  }, [activeView])

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

  // Track live provider availability (sign-in state) for the chat composer's
  // ModelPicker. There is no global provider setting to reconcile anymore —
  // each Conversation carries its own composer pick.
  useEffect(() => useProviderStore.getState().init(), [])

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

  // The editor/account chat rail is shown in editor and account views; in chat
  // and settings it's hidden (chat has its own panel, settings has none).
  const showChatRail = activeView === 'editor' || activeView === 'account'

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
        {/* EditorView + ChatView stay mounted once shown and are merely toggled
            visible, so the terminal (pty + scrollback) and chat scroll survive
            switching between editor and bloom. viewArea itself hides in editor
            full-width so the chat panel can span the whole window. */}
        <div
          className={styles.viewArea}
          style={activeView === 'editor' && isChatFullWidth ? { display: 'none' } : undefined}
        >
          <div className={styles.viewSlot} style={{ display: activeView === 'editor' ? 'flex' : 'none' }}>
            {viewMounted.editor && <EditorView />}
          </div>
          <div className={styles.viewSlot} style={{ display: activeView === 'chat' ? 'flex' : 'none' }}>
            {viewMounted.chat && <ChatView />}
          </div>
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'account' && <AccountView />}
        </div>
        {/* Editor/account chat rail — a second ChatPanel instance kept mounted
            (once the editor has been shown) so its scroll survives; only the
            visible panel owns the TTS/compression singletons via `primary`. */}
        <div
          className={styles.chatPanelSlot}
          style={{ display: showChatRail ? 'flex' : 'none' }}
        >
          {(viewMounted.editor || activeView === 'account') && <ChatPanel primary={showChatRail} />}
        </div>
      </main>
      <AppsDrawer />
      <BottomDock />
      <UpdateToast />
    </div>
  )
}

export default App
