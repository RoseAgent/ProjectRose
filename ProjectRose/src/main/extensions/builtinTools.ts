// Extension tools are now registered at runtime by each extension's main module
// via ctx.registerTools() — see extensionHandlers.ts.
// This file exists only to re-export the shared type so existing imports keep compiling.
export type { ExtensionToolEntry } from '../../shared/extension-types'

/** @deprecated Use getRegisteredExtensionTools from extensionHandlers instead */
export interface MainExtensionEntry {
  id: string
  tools: import('../../shared/extension-types').ExtensionToolEntry[]
}
