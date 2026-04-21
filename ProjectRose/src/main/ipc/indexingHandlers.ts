import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { indexProject, indexSingleFile } from '../services/indexingService'

export function registerIndexingHandlers(): void {
  ipcMain.handle(
    IPC.INDEXING_PROJECT,
    async (event, rootPath: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return indexProject(rootPath, win)
    }
  )

  ipcMain.handle(
    IPC.INDEXING_FILE,
    async (_event, payload: { filePath: string; content: string; rootPath: string }) => {
      await indexSingleFile(payload.filePath, payload.content, payload.rootPath)
    }
  )
}
