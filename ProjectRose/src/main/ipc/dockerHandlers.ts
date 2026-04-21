import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  checkDocker,
  findComposeFiles,
  listContainers,
  inspect,
  start,
  stop,
  restart,
  subscribeLogs,
  unsubscribeLogs,
  disposeAllDockerSessions,
  listFiles,
  getMounts
} from '../services/dockerService'

export function registerDockerHandlers(): void {
  ipcMain.handle(IPC.DOCKER_CHECK, async () => checkDocker())

  ipcMain.handle(IPC.DOCKER_LIST_COMPOSE, async (_event, rootPath: string) => {
    if (typeof rootPath !== 'string' || !rootPath) return []
    return findComposeFiles(rootPath)
  })

  ipcMain.handle(IPC.DOCKER_PS, async (_event, composeFiles: string[]) => {
    if (!Array.isArray(composeFiles)) return []
    return listContainers(composeFiles)
  })

  ipcMain.handle(IPC.DOCKER_INSPECT, async (_event, id: string) => inspect(id))

  ipcMain.handle(IPC.DOCKER_START, async (_event, id: string) => start(id))
  ipcMain.handle(IPC.DOCKER_STOP, async (_event, id: string) => stop(id))
  ipcMain.handle(IPC.DOCKER_RESTART, async (_event, id: string) => restart(id))

  ipcMain.handle(
    IPC.DOCKER_LOGS_SUBSCRIBE,
    async (event, payload: { id: string; tail?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const sessionId = subscribeLogs(
        payload.id,
        payload.tail ?? 500,
        (chunk) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.DOCKER_LOGS_DATA, { sessionId, chunk })
          }
        },
        (code) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.DOCKER_LOGS_EXIT, { sessionId, code })
          }
        }
      )
      return sessionId
    }
  )

  ipcMain.handle(IPC.DOCKER_LOGS_UNSUBSCRIBE, async (_event, sessionId: string) => {
    unsubscribeLogs(sessionId)
  })

  ipcMain.handle(IPC.DOCKER_LIST_FILES, async (_event, payload: { id: string; path: string }) => {
    return listFiles(payload.id, payload.path)
  })

  ipcMain.handle(IPC.DOCKER_MOUNTS, async (_event, id: string) => getMounts(id))

  app.on('window-all-closed', () => {
    disposeAllDockerSessions()
  })
}
