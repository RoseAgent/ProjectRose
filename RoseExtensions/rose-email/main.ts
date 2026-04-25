import { registerHandlers } from './src/main/handlers'
import type { ExtensionMainContext } from './src/main/types'
export { EMAIL_TOOLS } from './src/main/tools'

export function register(ctx: ExtensionMainContext): () => void {
  return registerHandlers(ctx)
}
