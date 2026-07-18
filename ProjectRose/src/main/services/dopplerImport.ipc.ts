import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { DopplerAccess, DopplerPreview, DopplerApplyResult, ImportTarget } from './dopplerImport'
import type { DopplerAuthStatus } from './dopplerAuthService'

// Doppler import (Settings > Connected Accounts). Two auth paths:
//  - sign in via the CLI device flow (login/logout/getStatus) — the token is
//    stored safeStorage-encrypted and preview/apply omit `access.token`;
//  - or a pasted token, which rides along per-call and is never persisted.
// Secret values never cross to the renderer — preview carries masked values,
// apply re-downloads in main.
export const dopplerIpc = defineIpc('doppler', {
  preview: method<[access: DopplerAccess], DopplerPreview>(),
  apply: method<[payload: { access: DopplerAccess; targets: ImportTarget[] }], DopplerApplyResult>(),
  login: method<[], void>(),
  logout: method<[], void>(),
  cancel: method<[], void>(),
  getStatus: method<[], DopplerAuthStatus>(),
  listProjects: method<[], string[]>(),
  listConfigs: method<[project: string], string[]>()
})
