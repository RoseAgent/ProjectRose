import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { listSessions, loadSession, saveSession, deleteSession, Session } from '../services/sessionService'

export function registerSessionHandlers(): void {
  ipcMain.handle(IPC.SESSION_LIST, (_e, rootPath: string) => listSessions(rootPath))
  ipcMain.handle(IPC.SESSION_LOAD, (_e, rootPath: string, sessionId: string) => loadSession(rootPath, sessionId))
  ipcMain.handle(IPC.SESSION_SAVE, (_e, rootPath: string, session: Session) => saveSession(rootPath, session))
  ipcMain.handle(IPC.SESSION_DELETE, (_e, rootPath: string, sessionId: string) => deleteSession(rootPath, sessionId))
}
