import { create } from 'zustand'
import type { SpamRule, InjectionPattern, EmailFilters } from '../shared/types'

export type { SpamRule, InjectionPattern, EmailFilters }

export interface EmailMessageMeta {
  uid: number
  subject: string
  from: string
  date: string
  read: boolean
  folder: string
  injectionDetected?: boolean
  urlhausDetected?: boolean
}

export interface UrlhausStatus {
  lastUpdated: number | null
  domainCount: number
}

interface EmailState {
  messages: EmailMessageMeta[]
  selectedUid: number | null
  body: string | null
  loading: boolean
  bodyLoading: boolean
  error: string | null
  activeFolder: string
  filters: EmailFilters | null
  urlhausStatus: UrlhausStatus | null
  fetchMessages: () => Promise<void>
  fetchMessage: (uid: number) => Promise<void>
  deleteMessage: (uid: number) => Promise<void>
  setActiveFolder: (folder: string) => void
  moveToFolder: (uid: number, folder: string) => Promise<void>
  loadFilters: () => Promise<void>
  saveFilters: (patch: Partial<EmailFilters>) => Promise<void>
  loadUrlhausStatus: () => Promise<void>
  refreshUrlhaus: () => Promise<void>
}

export const useEmailStore = create<EmailState>((set, get) => ({
  messages: [],
  selectedUid: null,
  body: null,
  loading: false,
  bodyLoading: false,
  error: null,
  activeFolder: 'inbox',
  filters: null,
  urlhausStatus: null,

  fetchMessages: async () => {
    set({ loading: true, error: null })
    try {
      const messages = await window.api.invoke('rose-email:fetchMessages') as EmailMessageMeta[]
      set({ messages, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  fetchMessage: async (uid: number) => {
    set({ selectedUid: uid, bodyLoading: true })
    try {
      const result = await window.api.invoke('rose-email:fetchBody', uid) as { body: string }
      set({ body: result.body, bodyLoading: false })
    } catch (err) {
      set({ body: null, bodyLoading: false, error: (err as Error).message })
    }
  },

  deleteMessage: async (uid: number) => {
    await window.api.invoke('rose-email:deleteMessage', uid)
    set(state => ({
      messages: state.messages.filter(m => m.uid !== uid),
      selectedUid: state.selectedUid === uid ? null : state.selectedUid,
      body: state.selectedUid === uid ? null : state.body
    }))
  },

  setActiveFolder: (folder: string) => {
    set({ activeFolder: folder, selectedUid: null, body: null })
  },

  moveToFolder: async (uid: number, folder: string) => {
    await window.api.invoke('rose-email:setMessageFolder', uid, folder)
    set(state => ({
      messages: state.messages.map(m => m.uid === uid ? { ...m, folder } : m)
    }))
  },

  loadFilters: async () => {
    const filters = await window.api.invoke('rose-email:loadFilters') as EmailFilters
    set({ filters })
  },

  saveFilters: async (patch: Partial<EmailFilters>) => {
    const filters = await window.api.invoke('rose-email:saveFilters', patch) as EmailFilters
    set({ filters })
  },

  loadUrlhausStatus: async () => {
    try {
      const urlhausStatus = await window.api.invoke('rose-email:getUrlhausStatus') as UrlhausStatus
      set({ urlhausStatus })
    } catch { /* extension not loaded */ }
  },

  refreshUrlhaus: async () => {
    try {
      const urlhausStatus = await window.api.invoke('rose-email:refreshUrlhaus') as UrlhausStatus
      set({ urlhausStatus })
    } catch { /* extension not loaded */ }
  }
}))
