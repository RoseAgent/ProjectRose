import { create } from 'zustand'

export interface DiscordAttachment { id: string; filename: string; url: string }
export interface DiscordEmbed {
  title?: string; url?: string; description?: string
  fields?: { name: string; value: string }[]
  image?: { url: string }
}
export interface DiscordReaction { emoji: string; count: number }
export interface DiscordMessage {
  id: string; timestamp: string; content: string
  authorUsername: string; authorDisplayName: string; avatarUrl?: string
  attachments: DiscordAttachment[]; embeds: DiscordEmbed[]; reactions: DiscordReaction[]
}
export interface DiscordChannel {
  id: string; name: string; guildId: string; guildName: string
}

interface DiscordState {
  connected: boolean
  channels: DiscordChannel[]
  enabledChannelIds: string[]
  activeChannelId: string | null
  messages: Record<string, DiscordMessage[]>
  hasMoreMessages: Record<string, boolean>
  loadingMessages: boolean
  input: string
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  selectChannel: (id: string) => Promise<void>
  fetchOlderMessages: (channelId: string) => Promise<void>
  sendMessage: () => Promise<void>
  setInput: (text: string) => void
  initEnabledChannels: (ids: string[]) => void
}

export const useDiscordStore = create<DiscordState>((set, get) => ({
  connected: false,
  channels: [],
  enabledChannelIds: [],
  activeChannelId: null,
  messages: {},
  hasMoreMessages: {},
  loadingMessages: false,
  input: '',

  connect: async () => {
    const result = await (window as any).api.invoke('rose-discord:connect') as {
      ok: boolean; channels: DiscordChannel[]; error?: string
    }
    if (result.ok) {
      set({ connected: true, channels: result.channels })
      ;(window as any).api.on('rose-discord:newMessage', (payload: { channelId: string; message: DiscordMessage }) => {
        const { channelId, message } = payload
        set((state) => ({
          messages: {
            ...state.messages,
            [channelId]: [...(state.messages[channelId] ?? []), message]
          }
        }))
      })
    }
  },

  disconnect: async () => {
    await (window as any).api.invoke('rose-discord:disconnect')
    set({ connected: false })
  },

  selectChannel: async (id: string) => {
    set({ activeChannelId: id, loadingMessages: true })
    const result = await (window as any).api.invoke('rose-discord:fetchMessages', id, 50) as {
      messages: DiscordMessage[]; hasMore: boolean
    }
    set((state) => ({
      messages: { ...state.messages, [id]: result.messages },
      hasMoreMessages: { ...state.hasMoreMessages, [id]: result.hasMore },
      loadingMessages: false
    }))
  },

  fetchOlderMessages: async (channelId: string) => {
    const state = get()
    const existing = state.messages[channelId] ?? []
    if (existing.length === 0) return
    const before = existing[0].id
    set({ loadingMessages: true })
    const result = await (window as any).api.invoke('rose-discord:fetchOlderMessages', channelId, before, 50) as {
      messages: DiscordMessage[]; hasMore: boolean
    }
    set((s) => ({
      messages: { ...s.messages, [channelId]: [...result.messages, ...existing] },
      hasMoreMessages: { ...s.hasMoreMessages, [channelId]: result.hasMore },
      loadingMessages: false
    }))
  },

  sendMessage: async () => {
    const { activeChannelId, input } = get()
    if (!activeChannelId || !input.trim()) return
    await (window as any).api.invoke('rose-discord:sendMessage', activeChannelId, input)
    set({ input: '' })
  },

  setInput: (text: string) => set({ input: text }),

  initEnabledChannels: (ids: string[]) => set({ enabledChannelIds: ids })
}))
