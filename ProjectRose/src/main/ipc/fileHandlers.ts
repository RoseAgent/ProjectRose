import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  readFileContent,
  writeFileContent,
  createFile,
  readDirectoryTree
} from '../services/fileService'

export function registerFileHandlers(): void {
  ipcMain.handle(IPC.FILE_READ, async (_event, filePath: string) => {
    return readFileContent(filePath)
  })

  ipcMain.handle(
    IPC.FILE_WRITE,
    async (_event, payload: { filePath: string; content: string }) => {
      await writeFileContent(payload.filePath, payload.content)
    }
  )

  ipcMain.handle(IPC.FILE_CREATE, async (_event, filePath: string) => {
    await createFile(filePath)
  })

  ipcMain.handle(IPC.FILE_READ_DIR_TREE, async (_event, dirPath: string) => {
    return readDirectoryTree(dirPath)
  })
}
