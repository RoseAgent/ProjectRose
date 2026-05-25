import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { ExtensionPromptListEntry, ExtensionPromptRead } from './promptService'

export const promptIpc = defineIpc('prompts', {
  readRose: method<[], string>(),
  writeRose: method<[content: string], void>(),
  listExtension: method<[rootPath: string], ExtensionPromptListEntry[]>(),
  readExtension: method<[rootPath: string, extId: string], ExtensionPromptRead>(),
  writeExtension: method<[rootPath: string, extId: string, content: string], void>(),
  resetExtension: method<[rootPath: string, extId: string], void>()
})
