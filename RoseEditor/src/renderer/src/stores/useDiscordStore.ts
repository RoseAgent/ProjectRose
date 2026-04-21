import { create } from 'zustand'
import type { DiscordChannel, DiscordMessage } from '../types/electron'
import { useSettingsStore } from './useSettingsStore'

interface DiscordState {
  connected: boolean
  channels: DiscordChannel[]
  enabledChannelIds: string[]
  activeChannelId: string | null
  messages: Record<string, DiscordMessage[]>
  beforeIds: Record<string, string | undefined>
  hasMoreMessages: Record<string, boolean>
  loadingChannels: boolean
  loadingMessages: boolean
  input: string
  error: string | null

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  loadChannels: () => Promise<void>
  selectChannel: (channelId: string) => void
  fetchMessages: (channelId: string, beforeId?: string) => Promise<void>
  fetchOlderMessages: (channelId: string) => Promise<void>
  sendMessage: () => Promise<void>
  setInput: (text: string) => void
  receiveMessage: (msg: DiscordMessage) => void
  toggleChannel: (channelId: string) => void
  initEnabledChannels: (ids: string[]) => void
}

let cleanupMessageListener: (() => void) | null = null
let cleanupStateListener: (() => void) | null = null

export const useDiscordStore = create<DiscordState>()((set, get) => ({
  connected: false,
  channels: [],
  enabledChannelIds: [],
  activeChannelId: null,
  messages: {},
  beforeIds: {},
  hasMoreMessages: {},
  loadingChannels: false,
  loadingMessages: false,
  input: '',
  error: null,

  connect: async () => {
    cleanupMessageListener?.()
    cleanupStateListener?.()

    cleanupMessageListener = window.api.discord.onMessageCreate((msg) => {
      get().receiveMessage(msg)
    })
    cleanupStateListener = window.api.discord.onConnectionState((state) => {
      set({ connected: state.connected })
    })

    const result = await window.api.discord.connect()
    if (result.ok) {
      set({ connected: true, error: null })
    } else {
      set({ connected: false, error: result.error ?? 'Connection failed' })
    }
  },

  disconnect: async () => {
    await window.api.discord.disconnect()
    cleanupMessageListener?.()
    cleanupStateListener?.()
    cleanupMessageListener = null
    cleanupStateListener = null
    set({ connected: false })
  },

  loadChannels: async () => {
    set({ loadingChannels: true })
    try {
      const channels = await window.api.discord.getChannels()
      set({ channels, loadingChannels: false })
    } catch {
      set({ loadingChannels: false })
    }
  },

  selectChannel: (channelId: string) => {
    set({ activeChannelId: channelId })
    const { messages, fetchMessages } = get()
    if (!messages[channelId]) {
      fetchMessages(channelId)
    }
  },

  fetchMessages: async (channelId: string, beforeId?: string) => {
    set({ loadingMessages: true })
    try {
      const fetched = await window.api.discord.fetchMessages(channelId, 50, beforeId)
      set((state) => {
        const existing = beforeId ? (state.messages[channelId] ?? []) : []
        const combined = beforeId ? [...fetched, ...existing] : fetched
        return {
          messages: { ...state.messages, [channelId]: combined },
          beforeIds: {
            ...state.beforeIds,
            [channelId]: fetched.length > 0 ? fetched[0].id : state.beforeIds[channelId]
          },
          hasMoreMessages: { ...state.hasMoreMessages, [channelId]: fetched.length === 50 },
          loadingMessages: false
        }
      })
    } catch {
      set({ loadingMessages: false })
    }
  },

  fetchOlderMessages: async (channelId: string) => {
    const { beforeIds, fetchMessages } = get()
    const beforeId = beforeIds[channelId]
    await fetchMessages(channelId, beforeId)
  },

  sendMessage: async () => {
    const { activeChannelId, input } = get()
    if (!activeChannelId || !input.trim()) return
    set({ input: '' })
    try {
      await window.api.discord.sendMessage(activeChannelId, input.trim())
    } catch (err) {
      set({ error: (err as Error).message, input })
    }
  },

  setInput: (text: string) => set({ input: text }),

  receiveMessage: (msg: DiscordMessage) => {
    const { enabledChannelIds } = get()
    if (!enabledChannelIds.includes(msg.channelId)) return
    set((state) => ({
      messages: {
        ...state.messages,
        [msg.channelId]: [...(state.messages[msg.channelId] ?? []), msg]
      }
    }))
  },

  toggleChannel: (channelId: string) => {
    const { enabledChannelIds } = get()
    const newIds = enabledChannelIds.includes(channelId)
      ? enabledChannelIds.filter((id) => id !== channelId)
      : [...enabledChannelIds, channelId]
    set({ enabledChannelIds: newIds })
    useSettingsStore.getState().update({ discordChannels: newIds })
  },

  initEnabledChannels: (ids: string[]) => set({ enabledChannelIds: ids })
}))
