import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { startLsp, registerLspIpcHandlers } from '../services/lspManager'

export function registerLspHandlers(): void {
  registerLspIpcHandlers()

  ipcMain.handle(IPC.INDEXING_PROJECT, async (event, rootPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.INDEXING_PROGRESS, {
        phase: 'checking',
        total: 0,
        completed: 0,
        message: 'Starting language servers...'
      })
    }

    const result = await startLsp(rootPath)

    const ready = (result.py ? 'Python' : '') + (result.py && result.ts ? ' & ' : '') + (result.ts ? 'TypeScript' : '')
    const message = ready ? `${ready} language server ready` : 'Language servers unavailable'
    const phase = ready ? 'done' : 'error'

    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.INDEXING_PROGRESS, {
        phase,
        total: 1,
        completed: 1,
        message
      })
    }

    return { indexed: 0, total: 0 }
  })
}
