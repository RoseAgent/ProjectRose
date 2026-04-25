export interface ExtensionToolEntry {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}

export interface ExtensionMainContext {
  getSettings: () => Promise<Record<string, unknown>>
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
  broadcast: (channel: string, data: unknown) => void
  registerTools: (tools: ExtensionToolEntry[]) => void
}
