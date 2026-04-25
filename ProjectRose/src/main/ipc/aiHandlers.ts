import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { chat, compressHistory, buildAgentMd, cancelActiveChat } from '../services/aiService'
import { resolveAskUserQuestion } from '../services/llmClient'
import type { Message } from '../../shared/roseModelTypes'

export function registerAiHandlers(): void {
  ipcMain.handle(
    IPC.AI_CHAT,
    async (_event, payload: { messages: Message[]; rootPath: string; sessionId: string }) => {
      return chat(payload.messages, payload.rootPath, payload.sessionId)
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

  ipcMain.handle(IPC.AI_CANCEL, () => {
    cancelActiveChat()
  })

  ipcMain.handle(
    IPC.AI_ASK_USER_RESPONSE,
    (_event, payload: { questionId: string; answer: string }) => {
      resolveAskUserQuestion(payload.questionId, payload.answer)
    }
  )
}
