import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow, setQuitting } from './window'
import { createTray, destroyTray } from './tray'
import { registerAllHandlers, registerIpcManifests } from './ipc'
import { attachDisplayMediaHandler } from './ipc/screenHandlers'
import { buildAppMenu } from './menu'
import { disposeAllTerminals } from './services/terminalService'
import { stopLsp } from './services/lspManager'
import { initAutoUpdater } from './services/updaterService'
import { toolRegistry } from './services/toolRegistry'
import { buildCoreTools } from './services/llmClient'
import { buildSubagentTools } from './services/subagentTools'
import { buildSkillTools } from './services/skillService'
import { ensureAgentRoseMd } from './services/roseSetupService'
import { ensureAgentHome } from './lib/agentHome'
import { initMemorySubsystem } from './services/memory'
import { startEmailSyncLoop } from './services/email/emailSyncLoop'
import { IPC } from '../shared/ipcChannels'
import log from 'electron-log/main'

// Without these listeners, Electron pops a modal dialog ("Uncaught
// Exception: ...") for any unhandled error in the main process. That's the
// right default during development but terrible at runtime: a single
// missing-binary or transient I/O failure can spam the user with a stack of
// dialogs they can't dismiss in bulk. Log the error and keep the app alive.
process.on('uncaughtException', (err) => {
  log.error('[main] uncaughtException', err)
})
process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection', reason)
})

// Ensure single instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _commandLine) => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })
}

// macOS delivers projectrose:// links via `open-url`. Must be registered as
// early as possible — before `whenReady` — because the event can fire during
// app launch when the user opens a link that triggers the app to start.
app.on('open-url', (event, url) => {
  event.preventDefault()
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
    win.webContents.send(IPC.DEEPLINK_RECEIVED, url)
  }
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.projectrose.app')

  // Materialise the agent home before anything reads from it. ensureAgentHome
  // creates ~/.rose/extensions/ if missing; ensureAgentRoseMd writes a
  // default ~/.rose/ROSE.md so the system prompt builder always has a file
  // to read, even if the user hasn't run the setup wizard yet.
  await ensureAgentHome().catch((err) => log.error('[main] ensureAgentHome', err))
  await ensureAgentRoseMd().catch((err) => log.error('[main] ensureAgentRoseMd', err))

  // Register the projectrose:// scheme. electron-builder installs this for
  // packaged Windows/Linux builds via the `protocols` config and for Mac via
  // `extendInfo.CFBundleURLTypes`, but in dev mode nothing's installed it
  // yet — calling this is a no-op when already registered.
  app.setAsDefaultProtocolClient('projectrose')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  toolRegistry.registerCoreTools(buildCoreTools)
  toolRegistry.registerSubagentSource((_ctx, turn) =>
    buildSubagentTools(
      turn.agentCtx,
      turn.model,
      turn.ollamaBaseUrl,
      turn.counter,
      turn.systemPrompt
    )
  )
  toolRegistry.registerSkillSource((ctx) =>
    buildSkillTools(ctx.rootPath, ctx.toolCtx.sessionId, ctx.emit)
  )
  registerAllHandlers()
  registerIpcManifests()
  attachDisplayMediaHandler()
  buildAppMenu()
  createWindow()
  createTray()
  initAutoUpdater()
  // Memory subsystem — starts the daily diary scheduler. Path scaffold for
  // ~/.rose/memory/{diary,behavior-records,contact,conversations,agent-activity}
  // was already created by ensureAgentHome() above.
  initMemorySubsystem()

  // Email background sync — polls the inbox and emits `new-message` so other
  // built-ins (rose-channels) can react to arrivals. Idempotent; a no-op
  // while no transport is configured. See ADR 0011 amendment 2026-05-25.
  startEmailSyncLoop()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// File → Quit / Cmd+Q / process signals all flow through `before-quit`. Mark
// the app as quitting so the window-close handler stops intercepting and
// lets the actual destroy go through.
app.on('before-quit', () => {
  setQuitting(true)
})

// The window's close handler hides instead of destroying when the tray is
// alive, so 'window-all-closed' only fires on an explicit quit. Keep the
// shutdown work here so the cleanup path runs once at the actual exit.
app.on('window-all-closed', () => {
  disposeAllTerminals()
  stopLsp()
  destroyTray()
  if (process.platform !== 'darwin') app.quit()
})
