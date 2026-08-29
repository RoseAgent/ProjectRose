import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { AppSettings, SearchProvider, ServiceHealth } from './settingsService'

export const settingsIpc = defineIpc('settings', {
  get: method<[rootPath?: string], AppSettings>(),
  set: method<[patch: Partial<AppSettings>, rootPath?: string], AppSettings>()
})

export const healthIpc = defineIpc('health', {
  checkAll: method<[], ServiceHealth[]>()
})

export interface OpenAICompatibleStatus {
  apiKeyStored: boolean
}

export const openAICompatibleIpc = defineIpc('openaiCompatible', {
  getStatus: method<[], OpenAICompatibleStatus>(),
  saveApiKey: method<[apiKey: string], OpenAICompatibleStatus>(),
  clearApiKey: method<[], OpenAICompatibleStatus>(),
  test: method<[], { ok: boolean; error?: string }>()
})

// BYO web-search provider (Settings > Providers > Search). The API key is
// write-only across IPC — status exposes only whether one is stored.
export interface SearchProviderStatus {
  provider: SearchProvider | null
  keyStored: boolean
}

export const searchIpc = defineIpc('searchProvider', {
  getStatus: method<[], SearchProviderStatus>(),
  saveCredentials: method<[payload: { provider: SearchProvider; apiKey: string }], SearchProviderStatus>(),
  clearCredentials: method<[], SearchProviderStatus>()
})
