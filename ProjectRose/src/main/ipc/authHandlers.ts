import { ipcMain, shell } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { handleLogout, getAuthStatus } from '../lib/authHandler'

const LOGIN_URL = 'https://projectrose.ai/login?redirect=projectrose://auth'

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC.AUTH_LOGIN, async () => {
    await shell.openExternal(LOGIN_URL)
  })

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    await handleLogout()
  })

  ipcMain.handle(IPC.AUTH_GET_STATUS, async () => {
    return getAuthStatus()
  })
}
