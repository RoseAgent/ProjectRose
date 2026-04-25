import { ipcMain } from 'electron'
import * as discord from './service'
import type { ExtensionMainContext } from './types'

export function registerHandlers(ctx: ExtensionMainContext): () => void {
  ipcMain.handle('rose-discord:connect', async () => {
    const settings = await ctx.getSettings()
    const token = String((settings as Record<string, unknown>)['discordBotToken'] ?? '')
    if (!token) return { ok: false, error: 'No bot token configured' }
    try {
      const channels = await discord.connect(token, (channelId, msg) => {
        ctx.broadcast('rose-discord:newMessage', { channelId, message: msg })
      })
      return { ok: true, channels }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('rose-discord:disconnect', async () => {
    try {
      await discord.disconnect()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('rose-discord:fetchMessages', async (_event, channelId: string, limit: number) => {
    try {
      const messages = await discord.fetchDiscordMessages(channelId, limit)
      return { messages, hasMore: messages.length === limit }
    } catch (err) {
      return { messages: [], hasMore: false }
    }
  })

  ipcMain.handle('rose-discord:fetchOlderMessages', async (_event, channelId: string, before: string, limit: number) => {
    try {
      const messages = await discord.fetchOlderMessages(channelId, before, limit)
      return { messages, hasMore: messages.length === limit }
    } catch (err) {
      return { messages: [], hasMore: false }
    }
  })

  ipcMain.handle('rose-discord:sendMessage', async (_event, channelId: string, content: string) => {
    try {
      await discord.sendDiscordMessage(channelId, content)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  return () => {
    ipcMain.removeHandler('rose-discord:connect')
    ipcMain.removeHandler('rose-discord:disconnect')
    ipcMain.removeHandler('rose-discord:fetchMessages')
    ipcMain.removeHandler('rose-discord:fetchOlderMessages')
    ipcMain.removeHandler('rose-discord:sendMessage')
    discord.disconnect().catch(() => {})
  }
}
