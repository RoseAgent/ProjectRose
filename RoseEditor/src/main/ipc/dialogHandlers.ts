import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { IPC } from '../../shared/ipcChannels'

export function registerDialogHandlers(): void {
  ipcMain.handle(IPC.DIALOG_OPEN_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      defaultPath: join(app.getPath('home'), '.rose')
    })

    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile']
    })

    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.DIALOG_SAVE_FILE, async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultPath || undefined
    })

    return result.canceled ? null : result.filePath
  })
}
