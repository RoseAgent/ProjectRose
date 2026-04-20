import { create } from 'zustand'
import type { EmailMessage, EmailFilters } from '../types/electron'

interface EmailState {
  messages: EmailMessage[]
  selectedUid: number | null
  body: string | null
  loading: boolean
  bodyLoading: boolean
  error: string | null
  activeFolder: string
  filters: EmailFilters | null

  fetchMessages: () => Promise<void>
  fetchMessage: (uid: number) => Promise<void>
  deleteMessage: (uid: number) => Promise<void>
  selectMessage: (uid: number) => void
  setActiveFolder: (folder: string) => void
  moveToFolder: (uid: number, folder: string) => Promise<void>
  loadFilters: () => Promise<void>
  saveFilters: (patch: Partial<EmailFilters>) => Promise<void>
}

export const useEmailStore = create<EmailState>()((set, get) => ({
  messages: [],
  selectedUid: null,
  body: null,
  loading: false,
  bodyLoading: false,
  error: null,
  activeFolder: 'inbox',
  filters: null,

  fetchMessages: async () => {
    set({ loading: true, error: null })
    try {
      const messages = await window.api.email.fetchMessages()
      set({ messages, loading: false })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  fetchMessage: async (uid: number) => {
    set({ bodyLoading: true, selectedUid: uid })
    try {
      const body = await window.api.email.fetchMessage(uid)
      // If injection detected in body, update local folder assignment
      if (body.startsWith('[QUARANTINED:')) {
        set((state) => ({
          messages: state.messages.map(m => m.uid === uid ? { ...m, folder: 'quarantine', injectionDetected: true } : m),
          body,
          bodyLoading: false
        }))
      } else {
        set({ body, bodyLoading: false })
      }
    } catch (err) {
      set({ bodyLoading: false, error: (err as Error).message })
    }
  },

  deleteMessage: async (uid: number) => {
    const result = await window.api.email.deleteMessage(uid)
    if (result.ok) {
      const { messages, selectedUid } = get()
      const updated = messages.filter((m) => m.uid !== uid)
      set({
        messages: updated,
        selectedUid: selectedUid === uid ? null : selectedUid,
        body: selectedUid === uid ? null : get().body
      })
    }
  },

  selectMessage: (uid: number) => {
    set({ selectedUid: uid, body: null })
  },

  setActiveFolder: (folder: string) => {
    set({ activeFolder: folder, selectedUid: null, body: null })
  },

  moveToFolder: async (uid: number, folder: string) => {
    await window.api.email.setMessageFolder(uid, folder)
    set((state) => ({
      messages: state.messages.map(m => m.uid === uid ? { ...m, folder } : m),
      selectedUid: state.selectedUid === uid && state.activeFolder !== folder ? null : state.selectedUid,
      body: state.selectedUid === uid && state.activeFolder !== folder ? null : state.body
    }))
  },

  loadFilters: async () => {
    try {
      const filters = await window.api.email.getFilters()
      set({ filters })
    } catch {
      // ignore
    }
  },

  saveFilters: async (patch: Partial<EmailFilters>) => {
    try {
      const updated = await window.api.email.setFilters(patch)
      set({ filters: updated })
    } catch {
      // ignore
    }
  }
}))
