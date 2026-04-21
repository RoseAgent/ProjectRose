import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { roseLibraryClient } from '../services/roseLibraryClient'
import type {
  FileHashEntry,
  FileUpdateItem,
  SearchRequest,
  FindReferencesRequest
} from '../../shared/roseLibraryTypes'

const client = roseLibraryClient

export function registerRoseLibraryHandlers(): void {
  ipcMain.handle(IPC.ROSE_HEALTH, async () => {
    return client.health()
  })

  ipcMain.handle(IPC.ROSE_CHECK_FILES, async (_event, files: FileHashEntry[]) => {
    return client.checkFiles(files)
  })

  ipcMain.handle(IPC.ROSE_UPDATE_FILES, async (_event, files: FileUpdateItem[]) => {
    return client.updateFiles(files)
  })

  ipcMain.handle(IPC.ROSE_STATUS, async () => {
    return client.status()
  })

  ipcMain.handle(IPC.ROSE_SEARCH, async (_event, params: SearchRequest) => {
    return client.search(params)
  })

  ipcMain.handle(IPC.ROSE_FIND_REFERENCES, async (_event, params: FindReferencesRequest) => {
    return client.findReferences(params)
  })
}
