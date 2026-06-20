import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { ExtensionPromptListEntry, ExtensionPromptRead } from './promptService'
import type { InjectedSections } from './agentMd'

export const promptIpc = defineIpc('prompts', {
  readRose: method<[], string>(),
  writeRose: method<[content: string], void>(),
  readInjected: method<[rootPath: string], InjectedSections>(),
  listExtension: method<[rootPath: string], ExtensionPromptListEntry[]>(),
  readExtension: method<[rootPath: string, extId: string], ExtensionPromptRead>(),
  writeExtension: method<[rootPath: string, extId: string, content: string], void>(),
  resetExtension: method<[rootPath: string, extId: string], void>()
})
