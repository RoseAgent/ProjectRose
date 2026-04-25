import { registerHandlers } from './src/main/handlers'
import type { ExtensionMainContext } from './src/main/types'

export function register(ctx: ExtensionMainContext): () => void {
  return registerHandlers(ctx)
}
