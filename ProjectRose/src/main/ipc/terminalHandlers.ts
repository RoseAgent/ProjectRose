import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  spawnTerminal,
  writeToTerminal,
  resizeTerminal,
  disposeTerminal
} from '../services/terminalService'

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    IPC.TERMINAL_SPAWN,
    (event, config?: { cwd?: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const cwd = config?.cwd || process.env.USERPROFILE || process.env.HOME || process.cwd()

      try {
        const sessionId = spawnTerminal(
          cwd,
          (data) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC.TERMINAL_DATA, data)
            }
          },
          (code) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC.TERMINAL_EXIT, code)
            }
          }
        )
        return sessionId
      } catch (err) {
        console.error('Failed to spawn terminal:', err)
        throw err
      }
    }
  )

  ipcMain.on(
    IPC.TERMINAL_WRITE,
    (_event, payload: { sessionId: string; data: string }) => {
      writeToTerminal(payload.sessionId, payload.data)
    }
  )

  ipcMain.handle(
    IPC.TERMINAL_RESIZE,
    (_event, payload: { sessionId: string; cols: number; rows: number }) => {
      resizeTerminal(payload.sessionId, payload.cols, payload.rows)
    }
  )

  ipcMain.handle(IPC.TERMINAL_DISPOSE, (_event, sessionId: string) => {
    disposeTerminal(sessionId)
  })
}
