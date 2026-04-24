import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow } from './window'
import { registerAllHandlers } from './ipc'
import { buildAppMenu } from './menu'
import { disposeAllTerminals } from './services/terminalService'
import { stopLsp } from './services/lspManager'
// Ensure single instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _commandLine) => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.projectrose.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAllHandlers()
  buildAppMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  disposeAllTerminals()
  stopLsp()
  if (process.platform !== 'darwin') app.quit()
})
