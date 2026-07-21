import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { BedrockAuthStatus } from './bedrockAuthService'

export const bedrockAuthIpc = defineIpc('bedrockAuth', {
  getStatus: method<[], BedrockAuthStatus>(),
  // AWS key pair. Write-only across IPC — status exposes only whether keys
  // are stored, never the values.
  saveCredentials: method<
    [payload: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }],
    BedrockAuthStatus
  >(),
  clearCredentials: method<[], BedrockAuthStatus>(),
  // Live model ids for the configured account + region, merged from Bedrock's
  // foundation-model and inference-profile lists. Drives the ModelPicker's
  // Bedrock group — never a hardcoded list. Must run in main: the control
  // plane needs SigV4-signed requests, and the renderer has no credentials.
  listModels: method<[], string[]>()
})
