export interface ExtensionMainContext {
  getSettings: () => Promise<Record<string, unknown>>
  broadcast: (channel: string, data: unknown) => void
}
