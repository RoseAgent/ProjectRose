import { registerHandlers } from './src/main/handlers'
import { EMAIL_TOOLS } from './src/main/tools'
import type { ExtensionMainContext } from './src/main/types'

export function register(ctx: ExtensionMainContext): () => void {
  ctx.registerTools(EMAIL_TOOLS)
  return registerHandlers(ctx)
}
