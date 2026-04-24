import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { openAuthWindow, handleLogout, getAuthStatus } from '../lib/authHandler'

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC.AUTH_LOGIN, async () => {
    await openAuthWindow()
  })

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    await handleLogout()
  })

  ipcMain.handle(IPC.AUTH_GET_STATUS, async () => {
    return getAuthStatus()
  })
}
