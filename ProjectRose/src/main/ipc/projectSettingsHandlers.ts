import { readFile, writeFile } from 'fs/promises'
import { ipcMain } from 'electron'
import { discoverPythonTools } from '../services/toolHandlers'
import { listInstalledExtensions } from './extensionHandlers'
import { prPath } from '../lib/projectPaths'

export interface ProjectSettings {
  disabledTools: string[]
}

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = { disabledTools: [] }

export const CORE_TOOL_NAMES = new Set([
  'read_file', 'write_file', 'edit_file', 'list_directory', 'grep', 'run_command', 'ask_user',
])

const CORE_TOOL_META = [
  { name: 'read_file', displayName: 'Read File', description: 'Read the contents of any file in the project', type: 'core' as const },
  { name: 'write_file', displayName: 'Write File', description: 'Write or overwrite file contents', type: 'core' as const },
  { name: 'edit_file', displayName: 'Edit File', description: 'Replace a unique string in a file (requires prior read_file)', type: 'core' as const },
  { name: 'list_directory', displayName: 'List Directory', description: 'List files and subdirectories', type: 'core' as const },
  { name: 'grep', displayName: 'Grep', description: 'Search file contents by regex pattern', type: 'core' as const },
  { name: 'run_command', displayName: 'Run Command', description: 'Execute shell commands in the project', type: 'core' as const },
  { name: 'ask_user', displayName: 'Ask User', description: 'Pause generation to ask the user a clarifying question', type: 'core' as const },
]

export async function readProjectSettings(rootPath: string): Promise<ProjectSettings> {
  try {
    const content = await readFile(prPath(rootPath, 'project-settings.json'), 'utf-8')
    return { ...DEFAULT_PROJECT_SETTINGS, ...JSON.parse(content) }
  } catch {
    return { ...DEFAULT_PROJECT_SETTINGS }
  }
}

export function registerProjectSettingsHandlers(): void {
  ipcMain.handle('project:getSettings', (_ev, rootPath: string) =>
    readProjectSettings(rootPath)
  )

  ipcMain.handle('project:setSettings', async (_ev, rootPath: string, patch: Partial<ProjectSettings>) => {
    const current = await readProjectSettings(rootPath)
    const updated = { ...current, ...patch }
    await writeFile(prPath(rootPath, 'project-settings.json'), JSON.stringify(updated, null, 2))
    return updated
  })

  ipcMain.handle('tools:list', async (_ev, rootPath: string) => {
    const pythonTools = await discoverPythonTools(rootPath)
    const pythonMeta = pythonTools.map((t) => ({
      name: t.name,
      displayName: t.name.replace(/^tool_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: t.description,
      type: 'python' as const
    }))

    const installed = await listInstalledExtensions(rootPath)
    const extensionMeta = installed
      .filter((ext) => ext.enabled && ext.manifest.provides.tools?.length)
      .flatMap((ext) =>
        (ext.manifest.provides.tools ?? []).map((t) => ({
          name: t.name,
          displayName: t.displayName,
          description: t.description,
          type: 'extension' as const,
          extensionId: ext.manifest.id,
          extensionName: ext.manifest.name,
        }))
      )

    return [...CORE_TOOL_META, ...extensionMeta, ...pythonMeta]
  })
}
