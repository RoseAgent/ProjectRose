import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { KimiAuthStatus } from './kimiAuthService'

export const kimiAuthIpc = defineIpc('kimiAuth', {
  login: method<[], void>(),
  logout: method<[], void>(),
  cancel: method<[], void>(),
  getStatus: method<[], KimiAuthStatus>(),
  // BYO Moonshot platform API key (kimiAuthMethod 'apikey'). Write-only
  // across IPC — status exposes only whether a key is stored.
  saveApiKey: method<[payload: { apiKey: string }], KimiAuthStatus>(),
  clearApiKey: method<[], KimiAuthStatus>()
})
