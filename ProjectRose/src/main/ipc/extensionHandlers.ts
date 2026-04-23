import { ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises'
import { createWriteStream, existsSync } from 'fs'
import https from 'https'
import http from 'http'
import { pipeline } from 'stream/promises'
import { IPC } from '../../shared/ipcChannels'
import { prPath } from '../lib/projectPaths'
import type { InstalledExtension, ExtensionManifest, ExtensionRegistry } from '../../shared/extension-types'

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

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = createWriteStream(destPath)
    proto.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        downloadFile(res.headers.location!, destPath).then(resolve).catch(reject)
        return
      }
      pipeline(res, file).then(resolve).catch(reject)
    }).on('error', reject)
  })
}

async function fetchRegistry(rawRegistryUrl: string): Promise<ExtensionRegistry> {
  return new Promise((resolve, reject) => {
    const proto = rawRegistryUrl.startsWith('https') ? https : http
    proto.get(rawRegistryUrl, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data) as ExtensionRegistry) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

export function registerExtensionHandlers(): void {
  ipcMain.handle(IPC.EXTENSION_LIST, async (_event, rootPath: string) => {
    if (!rootPath) return { installed: [] }
    const installed = await listInstalledExtensions(rootPath)
    return { installed }
  })

  ipcMain.handle(IPC.EXTENSION_INSTALL, async (_event, rootPath: string, downloadUrl: string) => {
    await ensureExtensionsDir(rootPath)
    const extensionsDir = getExtensionsDir(rootPath)
    const tmpZip = join(extensionsDir, `_tmp_${Date.now()}.zip`)
    const tmpDir = join(extensionsDir, `_extract_${Date.now()}`)
    try {
      await downloadFile(downloadUrl, tmpZip)
      await mkdir(tmpDir, { recursive: true })
      await extractZip(tmpZip, tmpDir)

      const manifest = await readManifest(tmpDir)
      if (!manifest) throw new Error('Invalid extension: missing rose-extension.json')

      const destDir = join(extensionsDir, manifest.id)
      if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true })
      const { renameSync } = await import('fs')
      renameSync(tmpDir, destDir)
    } finally {
      try { await rm(tmpZip, { force: true }) } catch { /* ignore */ }
      try { await rm(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    return { ok: true }
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
    await ensureExtensionsDir(rootPath)
    await mkdir(join(getExtensionsDir(rootPath), id), { recursive: true })
    await writeEnabledState(rootPath, id, false)
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_FETCH_REGISTRY, async (_event, registryUrl: string) => {
    return fetchRegistry(registryUrl)
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
}
