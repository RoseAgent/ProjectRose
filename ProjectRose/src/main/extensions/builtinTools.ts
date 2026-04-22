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

export function getExtensionToolsById(_extensionId: string): ExtensionToolEntry[] {
  return []
}

export function getAllBuiltinExtensionTools(): ExtensionToolEntry[] {
  return []
}
