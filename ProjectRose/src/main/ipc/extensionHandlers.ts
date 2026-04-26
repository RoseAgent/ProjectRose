import { ipcMain, dialog, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { IPC } from '../../shared/ipcChannels'
import { prPath } from '../lib/projectPaths'
import { readSettings, writeSettings } from './settingsHandlers'
import { heartbeatChat } from '../services/aiService'
import type { InstalledExtension, ExtensionManifest, ExtensionToolEntry } from '../../shared/extension-types'

function getExtensionsDir(rootPath: string): string {
  return prPath(rootPath, 'extensions')
}

async function ensureExtensionsDir(rootPath: string): Promise<void> {
  await mkdir(getExtensionsDir(rootPath), { recursive: true })
}

async function readManifest(extensionPath: string): Promise<ExtensionManifest | null> {
  try {
    const raw = await readFile(join(extensionPath, 'rose-extension.json'), 'utf-8')
    return JSON.parse(raw) as ExtensionManifest
  } catch {
    return null
  }
}

async function readEnabledState(rootPath: string, id: string): Promise<boolean> {
  try {
    const statePath = join(getExtensionsDir(rootPath), id, '.state.json')
    const raw = await readFile(statePath, 'utf-8')
    return JSON.parse(raw).enabled !== false
  } catch {
    return true
  }
}

async function writeEnabledState(rootPath: string, id: string, enabled: boolean): Promise<void> {
  const statePath = join(getExtensionsDir(rootPath), id, '.state.json')
  await writeFile(statePath, JSON.stringify({ enabled }), 'utf-8')
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const { execSync } = await import('child_process')
  if (process.platform === 'win32') {
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`)
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`)
  }
}

// Tracks cleanup functions for loaded extension main modules, keyed by "<rootPath>/<id>"
const loadedMains = new Map<string, () => void>()

// Registered tools per extension, keyed by "<rootPath>/<id>"
const extensionToolsRegistry = new Map<string, ExtensionToolEntry[]>()

export function getRegisteredExtensionTools(rootPath: string, enabledIds: string[]): ExtensionToolEntry[] {
  return enabledIds.flatMap((id) => extensionToolsRegistry.get(`${rootPath}/${id}`) ?? [])
}

interface ExtensionMainContext {
  rootPath: string
  getSettings: () => Promise<Record<string, unknown>>
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
  broadcast: (channel: string, data: unknown) => void
  registerTools: (tools: ExtensionToolEntry[]) => void
  runBackgroundAgent: (prompt: string) => Promise<string>
}

function loadExtensionMainModule(rootPath: string, id: string): void {
  const key = `${rootPath}/${id}`
  if (loadedMains.has(key)) return

  const mainPath = join(getExtensionsDir(rootPath), id, 'main.js')
  if (!existsSync(mainPath)) return

  try {
    const code = readFileSync(mainPath, 'utf-8')
    const extRequire = createRequire(mainPath)
    const mod: { exports: Record<string, unknown> } = { exports: {} }
    // eslint-disable-next-line no-new-func
    const wrapper = new Function('module', 'exports', 'require', '__dirname', '__filename', code)
    wrapper(mod, mod.exports, extRequire, dirname(mainPath), mainPath)

    const ctx: ExtensionMainContext = {
      rootPath,
      getSettings: async () => readSettings(rootPath) as unknown as Record<string, unknown>,
      updateSettings: async (patch: Record<string, unknown>) => {
        const current = await readSettings(rootPath)
        await writeSettings({ ...current, ...(patch as object) } as Parameters<typeof writeSettings>[0], rootPath)
      },
      broadcast: (channel: string, data: unknown) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(channel, data)
        }
      },
      registerTools: (tools: ExtensionToolEntry[]) => {
        extensionToolsRegistry.set(key, tools)
      },
      runBackgroundAgent: async (prompt: string) => {
        const { content } = await heartbeatChat([{ role: 'user', content: prompt }], rootPath)
        return content
      }
    }

    const register = mod.exports['register'] as ((ctx: ExtensionMainContext) => (() => void) | void) | undefined
    const cleanup = register?.(ctx)
    loadedMains.set(key, typeof cleanup === 'function' ? cleanup : () => {})
  } catch (err) {
    console.error(`[rose-ext] Failed to load main module for ${id}:`, err)
  }
}

function unloadExtensionMainModule(rootPath: string, id: string): void {
  const key = `${rootPath}/${id}`
  const cleanup = loadedMains.get(key)
  if (cleanup) {
    try { cleanup() } catch {}
    loadedMains.delete(key)
  }
  extensionToolsRegistry.delete(key)
}

export async function listInstalledExtensions(rootPath: string): Promise<InstalledExtension[]> {
  if (!rootPath) return []
  const extensionsDir = getExtensionsDir(rootPath)
  await mkdir(extensionsDir, { recursive: true })
  let entries: string[]
  try {
    entries = await readdir(extensionsDir)
  } catch {
    return []
  }

  const results: InstalledExtension[] = []
  for (const entry of entries) {
    const extensionPath = join(extensionsDir, entry)
    const manifest = await readManifest(extensionPath)
    if (!manifest) continue
    const enabled = await readEnabledState(rootPath, manifest.id)
    results.push({ manifest, installPath: extensionPath, enabled })
  }
  return results
}

export function registerExtensionHandlers(): void {
  ipcMain.handle(IPC.EXTENSION_LIST, async (_event, rootPath: string) => {
    if (!rootPath) return { installed: [] }
    const installed = await listInstalledExtensions(rootPath)
    return { installed }
  })

  ipcMain.handle(IPC.EXTENSION_INSTALL_FROM_DISK, async (event, rootPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Extension Package', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }

    const zipPath = result.filePaths[0]
    await ensureExtensionsDir(rootPath)
    const extensionsDir = getExtensionsDir(rootPath)
    const tmpDir = join(extensionsDir, `_extract_${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    try {
      await extractZip(zipPath, tmpDir)

      const manifest = await readManifest(tmpDir)
      if (!manifest) throw new Error('Invalid extension: missing rose-extension.json')

      const destDir = join(extensionsDir, manifest.id)
      if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true })
      const { renameSync } = await import('fs')
      renameSync(tmpDir, destDir)
    } catch (err) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      throw err
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_UNINSTALL, async (_event, rootPath: string, id: string) => {
    unloadExtensionMainModule(rootPath, id)
    const extensionPath = join(getExtensionsDir(rootPath), id)
    await rm(extensionPath, { recursive: true, force: true })
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_ENABLE, async (_event, rootPath: string, id: string) => {
    await ensureExtensionsDir(rootPath)
    await mkdir(join(getExtensionsDir(rootPath), id), { recursive: true })
    await writeEnabledState(rootPath, id, true)
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_DISABLE, async (_event, rootPath: string, id: string) => {
    unloadExtensionMainModule(rootPath, id)
    await ensureExtensionsDir(rootPath)
    await mkdir(join(getExtensionsDir(rootPath), id), { recursive: true })
    await writeEnabledState(rootPath, id, false)
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_LOAD_RENDERER, async (_event, rootPath: string, id: string) => {
    const rendererPath = join(getExtensionsDir(rootPath), id, 'renderer.js')
    try {
      const code = await readFile(rendererPath, 'utf-8')
      return { ok: true, code }
    } catch {
      return { ok: false, code: null }
    }
  })

  ipcMain.handle(IPC.EXTENSION_LOAD_MAIN, (_event, rootPath: string, id: string) => {
    loadExtensionMainModule(rootPath, id)
    return { ok: true }
  })
}
