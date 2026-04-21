import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { readSettings } from './settingsHandlers'
import {
  connectDiscord,
  disconnectDiscord,
  fetchDiscordChannels,
  fetchDiscordMessages,
  sendDiscordMessage,
  type DiscordMessage
} from '../services/discordService'

function notifyRenderer(event: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, data)
  }
}

export function registerDiscordHandlers(): void {
  ipcMain.handle(IPC.DISCORD_CONNECT, async (): Promise<{ ok: boolean; error?: string }> => {
    const cfg = await readSettings()
    if (!cfg.discordBotToken) return { ok: false, error: 'No bot token configured' }
    try {
      await connectDiscord(cfg.discordBotToken, (msg: DiscordMessage) => {
        notifyRenderer(IPC.DISCORD_MESSAGE_CREATE, msg)
      })
      notifyRenderer(IPC.DISCORD_CONNECTION_STATE, { connected: true })
      return { ok: true }
    } catch (err) {
      notifyRenderer(IPC.DISCORD_CONNECTION_STATE, { connected: false })
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.DISCORD_DISCONNECT, async (): Promise<void> => {
    disconnectDiscord()
    notifyRenderer(IPC.DISCORD_CONNECTION_STATE, { connected: false })
  })

  ipcMain.handle(IPC.DISCORD_GET_CHANNELS, async (): Promise<unknown> => {
    try { return await fetchDiscordChannels() }
    catch { return [] }
  })

  ipcMain.handle(
    IPC.DISCORD_FETCH_MESSAGES,
    async (_event, channelId: string, limit: number, beforeId?: string): Promise<unknown> => {
      try { return await fetchDiscordMessages(channelId, limit, beforeId) }
      catch { return [] }
    }
  )

  ipcMain.handle(
    IPC.DISCORD_SEND_MESSAGE,
    async (_event, channelId: string, content: string): Promise<unknown> => {
      return sendDiscordMessage(channelId, content)
    }
  )
}
