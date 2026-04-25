import { ipcMain } from 'electron'
import * as docker from './service'
import type { ExtensionMainContext } from './types'

const CHANNELS = [
  'rose-docker:check',
  'rose-docker:listCompose',
  'rose-docker:listContainers',
  'rose-docker:start',
  'rose-docker:stop',
  'rose-docker:restart',
  'rose-docker:inspect',
  'rose-docker:listFiles',
  'rose-docker:mounts',
  'rose-docker:subscribeLogs',
  'rose-docker:unsubscribeLogs'
]

export function registerHandlers(ctx: ExtensionMainContext): () => void {
  ipcMain.handle('rose-docker:check', () => {
    return docker.checkDocker()
  })

  ipcMain.handle('rose-docker:listCompose', (_event, rootPath: string) => {
    return docker.findComposeFiles(rootPath)
  })

  ipcMain.handle('rose-docker:listContainers', (_event, composeFiles: string[]) => {
    return docker.listContainers(composeFiles)
  })

  ipcMain.handle('rose-docker:start', (_event, id: string) => {
    return docker.start(id)
  })

  ipcMain.handle('rose-docker:stop', (_event, id: string) => {
    return docker.stop(id)
  })

  ipcMain.handle('rose-docker:restart', (_event, id: string) => {
    return docker.restart(id)
  })

  ipcMain.handle('rose-docker:inspect', (_event, id: string) => {
    return docker.inspect(id)
  })

  ipcMain.handle('rose-docker:listFiles', (_event, id: string, path: string) => {
    return docker.listFiles(id, path)
  })

  ipcMain.handle('rose-docker:mounts', (_event, id: string) => {
    return docker.getMounts(id)
  })

  ipcMain.handle('rose-docker:subscribeLogs', (_event, id: string, tail: number) => {
    let sessionId: string
    sessionId = docker.subscribeLogs(
      id,
      tail,
      (chunk) => ctx.broadcast('rose-docker:logsData', { sessionId, chunk }),
      (code) => ctx.broadcast('rose-docker:logsExit', { sessionId, code })
    )
    return { sessionId }
  })

  ipcMain.handle('rose-docker:unsubscribeLogs', (_event, sessionId: string) => {
    docker.unsubscribeLogs(sessionId)
  })

  return () => {
    for (const channel of CHANNELS) {
      ipcMain.removeHandler(channel)
    }
    docker.disposeAllSessions()
  }
}
