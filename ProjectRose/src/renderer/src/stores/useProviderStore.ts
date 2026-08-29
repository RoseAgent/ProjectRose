import { create } from 'zustand'
import { useSettingsStore } from './useSettingsStore'

interface ProviderState {
  ollamaModels: string[]
  init: () => () => void
  refreshOllamaModels: () => Promise<void>
}

export const useProviderStore = create<ProviderState>()((set, get) => ({
  ollamaModels: [],

  init: () => {
    void get().refreshOllamaModels()
    return () => {}
  },

  refreshOllamaModels: async () => {
    const baseUrl = useSettingsStore.getState().ollamaBaseUrl.trim().replace(/\/+$/, '')
    if (!baseUrl) {
      set({ ollamaModels: [] })
      return
    }
    try {
      const res = await fetch(`${baseUrl}/api/tags`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { models?: Array<{ name?: string }> }
      const names = (body.models ?? [])
        .map((m) => m.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
      set({ ollamaModels: names })
    } catch {
      // Keep the last known list during a transient outage.
    }
  }
}))
