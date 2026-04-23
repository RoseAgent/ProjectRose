import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { chat, compressHistory, buildAgentMd } from '../services/aiService'
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

  ipcMain.handle(
    IPC.AI_GET_SYSTEM_PROMPT,
    async (_event, rootPath: string) => {
      return buildAgentMd(rootPath)
    }
  )
}
