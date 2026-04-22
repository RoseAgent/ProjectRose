import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow } from './window'
import { registerAllHandlers } from './ipc'
import { buildAppMenu } from './menu'
import { disposeAllTerminals } from './services/terminalService'
import { stopLsp } from './services/lspManager'
import { startRoseSpeech, stopRoseSpeech } from './services/roseSpeechService'
import { handleDeepLink } from './lib/authHandler'

// Ensure single instance and capture deep links on Windows
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith('projectrose://'))
    if (url) handleDeepLink(url)
    const [win] = BrowserWindow.getAllWindows()
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
}

app.setAsDefaultProtocolClient('projectrose')

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.projectrose.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Handle deep link passed via argv on Windows (first launch)
  const deepLinkArg = process.argv.find((arg) => arg.startsWith('projectrose://'))
  if (deepLinkArg) handleDeepLink(deepLinkArg)

  registerAllHandlers()
  buildAppMenu()
  createWindow()

  startRoseSpeech()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// macOS: handle deep link via open-url event
app.on('open-url', (_event, url) => {
  handleDeepLink(url)
})

app.on('window-all-closed', () => {
  disposeAllTerminals()
  stopLsp()
  stopRoseSpeech()
  if (process.platform !== 'darwin') app.quit()
})
