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
  // Model ids fetched live from Kimi's /models endpoint for the active auth
  // method. Empty until a fetch succeeds; the picker shows no Kimi options
  // until then rather than a hardcoded guess.
  kimiModels: string[]
  // Last /models fetch error (e.g. a 401 from a bad key), so the picker can
  // say why Kimi has no options instead of silently omitting the provider.
  // Null when the last fetch succeeded or none has run.
  kimiModelsError: string | null
  // Whether an AWS key pair is stored. Bedrock has no sign-in flow — stored
  // credentials are the whole of "configured".
  bedrockConfigured: boolean
  // Model ids fetched live from Bedrock's control plane for the configured
  // account + region. Same contract as kimiModels: empty until a fetch lands,
  // so the picker never shows a hardcoded guess.
  bedrockModels: string[]
  bedrockModelsError: string | null
  // Fetch initial auth statuses and subscribe to changes. Returns the
  // unsubscribe cleanup for the caller's effect.
  init: () => () => void
  refreshOllamaModels: () => Promise<void>
  refreshKimiModels: () => Promise<void>
  refreshBedrockModels: () => Promise<void>
  kimiAvailable: () => boolean
}

export const useProviderStore = create<ProviderState>()((set, get) => ({
  loaded: false,
  prLoggedIn: false,
  kimiOauth: false,
  kimiKey: false,
  ollamaModels: [],
  kimiModels: [],
  kimiModelsError: null,
  bedrockConfigured: false,
  bedrockModels: [],
  bedrockModelsError: null,

  init: () => {
    let cancelled = false
    Promise.all([
      window.api.auth.getStatus().catch(() => ({ loggedIn: false })),
      window.api.kimiAuth.getStatus().catch(() => ({ loggedIn: false, apiKeyStored: false })),
      window.api.bedrockAuth
        .getStatus()
        .catch(() => ({ credentialsStored: false, region: '' }))
    ]).then(([pr, kimi, bedrock]) => {
      if (cancelled) return
      set({
        prLoggedIn: pr.loggedIn,
        kimiOauth: kimi.loggedIn,
        kimiKey: kimi.apiKeyStored,
        bedrockConfigured: bedrock.credentialsStored,
        loaded: true
      })
      // Pull the live Kimi model list once we know an auth method is usable.
      if (kimi.loggedIn || kimi.apiKeyStored) void get().refreshKimiModels()
      if (bedrock.credentialsStored) void get().refreshBedrockModels()
    })
    const offPr = window.api.auth.onChanged((d) => set({ prLoggedIn: d.loggedIn }))
    const offKimi = window.api.kimiAuth.onChanged((d) => {
      set({ kimiOauth: d.loggedIn, kimiKey: d.apiKeyStored })
      // Signing in/out or swapping the key changes which models are reachable.
      if (d.loggedIn || d.apiKeyStored) void get().refreshKimiModels()
      else set({ kimiModels: [], kimiModelsError: null })
    })
    const offBedrock = window.api.bedrockAuth.onChanged((d) => {
      set({ bedrockConfigured: d.credentialsStored })
      if (d.credentialsStored) void get().refreshBedrockModels()
      else set({ bedrockModels: [], bedrockModelsError: null })
    })
    return () => {
      cancelled = true
      offPr()
      offKimi()
      offBedrock()
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

  refreshKimiModels: async () => {
    try {
      const ids = await window.api.kimiAuth.listModels()
      set({ kimiModels: ids, kimiModelsError: null })
    } catch (e) {
      // Bad/expired key, wrong auth method, or endpoint unreachable. Record
      // the reason so the picker can explain the empty Kimi group instead of
      // dropping the provider silently; keep the last known list either way.
      set({ kimiModelsError: e instanceof Error ? e.message : 'Failed to load Kimi models' })
    }
  },

  refreshBedrockModels: async () => {
    try {
      const ids = await window.api.bedrockAuth.listModels()
      set({ bedrockModels: ids, bedrockModelsError: null })
    } catch (e) {
      // Bad keys, wrong region, or a missing bedrock:ListFoundationModels IAM
      // permission. Same contract as Kimi: record the reason so the picker can
      // explain the empty group; keep the last known list either way.
      set({
        bedrockModelsError: e instanceof Error ? e.message : 'Failed to load Bedrock models'
      })
    }
  },

  // Whether Kimi is usable under the currently-configured auth method.
  kimiAvailable: () => {
    const method = useSettingsStore.getState().kimiAuthMethod
    return method === 'apikey' ? get().kimiKey : get().kimiOauth
  }
}))
