import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { readCostLogs } from '../services/costTracker'

export function registerCostHandlers(): void {
  ipcMain.handle(IPC.COST_GET_LOGS, async (_event, rootPath: string) => {
    return readCostLogs(rootPath)
  })
}
