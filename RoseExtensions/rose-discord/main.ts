import { registerHandlers } from './src/main/handlers'
import { DISCORD_TOOLS } from './src/main/tools'
import type { ExtensionMainContext } from './src/main/types'

export function register(ctx: ExtensionMainContext): () => void {
  ctx.registerTools(DISCORD_TOOLS)
  return registerHandlers(ctx)
}
