import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { chat, compressHistory } from '../services/aiService'
import type { Message } from '../../shared/roseModelTypes'

export function registerAiHandlers(): void {
  ipcMain.handle(
    IPC.AI_CHAT,
    async (_event, payload: { messages: Message[]; rootPath: string }) => {
      return chat(payload.messages, payload.rootPath)
    }
  )

  ipcMain.handle(
    IPC.AI_COMPRESS,
    async (_event, messages: Message[]) => {
      return compressHistory(messages)
    }
  )
}
