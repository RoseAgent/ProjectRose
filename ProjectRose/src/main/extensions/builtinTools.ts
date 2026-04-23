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

const EXTENSION_TOOLS_MAP: Record<string, ExtensionToolEntry[]> = {
  'rose-discord': DISCORD_TOOLS,
  'rose-email': EMAIL_TOOLS,
}

export function getExtensionToolsById(extensionId: string): ExtensionToolEntry[] {
  return EXTENSION_TOOLS_MAP[extensionId] ?? []
}

export function getAllBuiltinExtensionTools(enabledIds?: string[]): ExtensionToolEntry[] {
  const ids = enabledIds ?? Object.keys(EXTENSION_TOOLS_MAP)
  return ids.flatMap((id) => EXTENSION_TOOLS_MAP[id] ?? [])
}
