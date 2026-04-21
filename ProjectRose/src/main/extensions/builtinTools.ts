import { DISCORD_TOOLS } from '@ext/rose-discord/main'
import { EMAIL_TOOLS } from '@ext/rose-email/main'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ExtensionToolEntry {
  name: string
  description: string
  schema: Record<string, any>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}

export interface MainExtensionEntry {
  id: string
  tools: ExtensionToolEntry[]
}

export const BUILTIN_EXTENSION_TOOLS: MainExtensionEntry[] = [
  { id: 'rose-email',   tools: EMAIL_TOOLS },
  { id: 'rose-discord', tools: DISCORD_TOOLS }
]

export function getExtensionToolsById(extensionId: string): ExtensionToolEntry[] {
  return BUILTIN_EXTENSION_TOOLS.find((e) => e.id === extensionId)?.tools ?? []
}

export function getAllBuiltinExtensionTools(): ExtensionToolEntry[] {
  return BUILTIN_EXTENSION_TOOLS.flatMap((e) => e.tools)
}
