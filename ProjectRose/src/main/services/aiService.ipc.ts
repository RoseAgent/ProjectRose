import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { Message } from '../../shared/roseModelTypes'
import type { ChatResponse, ContextStatus, ContextStatusCompression, CompressionOutcome } from './aiService'
import type { ScreenshotResult } from './chatSession'
import type { ModelConfig } from '../../shared/modelConfig'

// Request channels only. The ten event-broadcast channels (AI_TOKEN /
// AI_THINKING / AI_TOOL_CALL_{START,END} / AI_FILE_MODIFIED /
// AI_MODEL_SELECTED / AI_STREAM_RESET / AI_ASK_USER / AI_INJECTED_MESSAGE /
// AI_CAPTURE_SCREENSHOT) stay as IPC enum entries — they're sent from main
// via webContents.send, which the manifest doesn't cover.
export const aiIpc = defineIpc('ai', {
  chat: method<
    [payload: { messages: Message[]; rootPath: string; sessionId: string; model?: ModelConfig }],
    ChatResponse
  >(),
  contextStatus: method<
    [payload: {
      rootPath: string
      messages: Array<Record<string, unknown>>
      compression: ContextStatusCompression | null
      model?: ModelConfig
    }],
    ContextStatus
  >(),
  compressToolNoise: method<
    [payload: {
      rootPath: string
      messages: Array<Record<string, unknown>>
      full?: boolean
      model?: ModelConfig
    }],
    CompressionOutcome
  >(),
  getSystemPrompt: method<[rootPath: string], string>(),
  cancel: method<[payload: { sessionId: string }], void>(),
  askUserResponse: method<
    [payload: { sessionId: string; questionId: string; answer: string }],
    void
  >(),
  captureScreenshotResult: method<
    [payload: { sessionId: string; requestId: string; result: ScreenshotResult }],
    void
  >()
})
