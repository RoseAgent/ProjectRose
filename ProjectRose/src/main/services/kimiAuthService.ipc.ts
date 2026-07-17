import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { KimiAuthStatus } from './kimiAuthService'

export const kimiAuthIpc = defineIpc('kimiAuth', {
  login: method<[], void>(),
  logout: method<[], void>(),
  cancel: method<[], void>(),
  getStatus: method<[], KimiAuthStatus>()
})
