import { create } from 'zustand'
import { useSettingsStore } from './useSettingsStore'

// Live provider availability for the chat composer's ModelPicker: which Rose
// providers are actually usable right now (signed in / configured) and which
// Ollama models are installed. Replaces the old App.tsx effect that wrote a
// global hostMode setting — availability is now just data the picker reads.

interface ProviderState {
  loaded: boolean
  prLoggedIn: boolean
  kimiOauth: boolean
  kimiKey: boolean
  ollamaModels: string[]
  // Fetch initial auth statuses and subscribe to changes. Returns the
  // unsubscribe cleanup for the caller's effect.
  init: () => () => void
  refreshOllamaModels: () => Promise<void>
  kimiAvailable: () => boolean
}

export const useProviderStore = create<ProviderState>()((set, get) => ({
  loaded: false,
  prLoggedIn: false,
  kimiOauth: false,
  kimiKey: false,
  ollamaModels: [],

  init: () => {
    let cancelled = false
    Promise.all([
      window.api.auth.getStatus().catch(() => ({ loggedIn: false })),
      window.api.kimiAuth.getStatus().catch(() => ({ loggedIn: false, apiKeyStored: false }))
    ]).then(([pr, kimi]) => {
      if (cancelled) return
      set({
        prLoggedIn: pr.loggedIn,
        kimiOauth: kimi.loggedIn,
        kimiKey: kimi.apiKeyStored,
        loaded: true
      })
    })
    const offPr = window.api.auth.onChanged((d) => set({ prLoggedIn: d.loggedIn }))
    const offKimi = window.api.kimiAuth.onChanged((d) =>
      set({ kimiOauth: d.loggedIn, kimiKey: d.apiKeyStored })
    )
    return () => {
      cancelled = true
      offPr()
      offKimi()
    }
  },

  refreshOllamaModels: async () => {
    const baseUrl = useSettingsStore.getState().ollamaBaseUrl.trim().replace(/\/+$/, '')
    if (!baseUrl) {
      set({ ollamaModels: [] })
      return
    }
    try {
      const res = await fetch(`${baseUrl}/api/tags`)
      const body = (await res.json()) as { models?: Array<{ name?: string }> }
      const names = (body.models ?? [])
        .map((m) => m.name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0)
      set({ ollamaModels: names })
    } catch {
      // Ollama unreachable — keep whatever we last knew rather than blanking
      // the picker mid-session.
    }
  },

  // Whether Kimi is usable under the currently-configured auth method.
  kimiAvailable: () => {
    const method = useSettingsStore.getState().kimiAuthMethod
    return method === 'apikey' ? get().kimiKey : get().kimiOauth
  }
}))
