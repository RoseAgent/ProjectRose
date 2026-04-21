import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises'
import { createWriteStream, existsSync } from 'fs'
import https from 'https'
import http from 'http'
import { pipeline } from 'stream/promises'
import { IPC } from '../../shared/ipcChannels'
import type { InstalledExtension, ExtensionManifest, ExtensionRegistry } from '../../shared/extension-types'

const FIRST_PARTY_MANIFESTS: Record<string, ExtensionManifest> = {
  'rose-discord': {
    id: 'rose-discord', name: 'Discord', version: '1.0.0',
    description: 'Discord channel integration and messaging', author: 'ProjectRose',
    navItem: { label: 'Discord', iconName: 'discord' },
    provides: { pageView: true, globalSettings: true, agentTools: true }
  },
  'rose-email': {
    id: 'rose-email', name: 'Email', version: '1.0.0',
    description: 'IMAP email management', author: 'ProjectRose',
    navItem: { label: 'Email', iconName: 'email' },
    provides: { pageView: true, globalSettings: true, agentTools: true }
  },
  'rose-git': {
    id: 'rose-git', name: 'Git', version: '1.0.0',
    description: 'Git repository management', author: 'ProjectRose',
    navItem: { label: 'Git', iconName: 'git' },
    provides: { pageView: true }
  },
  'rose-docker': {
    id: 'rose-docker', name: 'Docker', version: '1.0.0',
    description: 'Docker container management', author: 'ProjectRose',
    navItem: { label: 'Docker', iconName: 'docker' },
    provides: { pageView: true }
  },
  'rose-listen': {
    id: 'rose-listen', name: 'Listen', version: '1.0.0',
    description: 'Active listening with speaker diarization', author: 'ProjectRose',
    navItem: { label: 'Listen', iconName: 'listen' },
    provides: { pageView: true, globalSettings: true }
  }
}

const EXTENSIONS_DIR = join(app.getPath('userData'), 'extensions')

async function ensureExtensionsDir(): Promise<void> {
  await mkdir(EXTENSIONS_DIR, { recursive: true })
}

async function readManifest(extensionPath: string): Promise<ExtensionManifest | null> {
  try {
    const raw = await readFile(join(extensionPath, 'rose-extension.json'), 'utf-8')
    return JSON.parse(raw) as ExtensionManifest
  } catch {
    return null
  }
}

async function readEnabledState(id: string): Promise<boolean> {
  try {
    const statePath = join(EXTENSIONS_DIR, id, '.state.json')
    const raw = await readFile(statePath, 'utf-8')
    return JSON.parse(raw).enabled !== false
  } catch {
    return true
  }
}

async function writeEnabledState(id: string, enabled: boolean): Promise<void> {
  const statePath = join(EXTENSIONS_DIR, id, '.state.json')
  await writeFile(statePath, JSON.stringify({ enabled }), 'utf-8')
}

async function listInstalledExtensions(): Promise<InstalledExtension[]> {
  await ensureExtensionsDir()
  let entries: string[]
  try {
    entries = await readdir(EXTENSIONS_DIR)
  } catch {
    return []
  }

  const results: InstalledExtension[] = []
  for (const entry of entries) {
    const extensionPath = join(EXTENSIONS_DIR, entry)
    const manifest = await readManifest(extensionPath)
    if (!manifest) continue
    const enabled = await readEnabledState(manifest.id)
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
  ipcMain.handle(IPC.EXTENSION_LIST, async () => {
    const installed = await listInstalledExtensions()
    return { installed }
  })

  ipcMain.handle(IPC.EXTENSION_INSTALL, async (_event, downloadUrl: string, extensionId?: string) => {
    await ensureExtensionsDir()

    // First-party extensions: code is already bundled, just write the manifest
    if (extensionId && FIRST_PARTY_MANIFESTS[extensionId]) {
      const manifest = FIRST_PARTY_MANIFESTS[extensionId]
      const destDir = join(EXTENSIONS_DIR, extensionId)
      await mkdir(destDir, { recursive: true })
      await writeFile(join(destDir, 'rose-extension.json'), JSON.stringify(manifest, null, 2), 'utf-8')
      await writeFile(join(destDir, '.state.json'), JSON.stringify({ enabled: true }), 'utf-8')
      return { ok: true }
    }

    // Third-party: download and extract zip
    const tmpZip = join(EXTENSIONS_DIR, `_tmp_${Date.now()}.zip`)
    try {
      await downloadFile(downloadUrl, tmpZip)
      const { execSync } = await import('child_process')
      const tmpDir = join(EXTENSIONS_DIR, `_extract_${Date.now()}`)
      await mkdir(tmpDir, { recursive: true })
      execSync(`unzip -o "${tmpZip}" -d "${tmpDir}"`)

      const manifest = await readManifest(tmpDir)
      if (!manifest) throw new Error('Invalid extension: missing rose-extension.json')

      const destDir = join(EXTENSIONS_DIR, manifest.id)
      if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true })
      const { renameSync } = await import('fs')
      renameSync(tmpDir, destDir)
    } finally {
      try { await rm(tmpZip, { force: true }) } catch { /* ignore */ }
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_UNINSTALL, async (_event, id: string) => {
    const extensionPath = join(EXTENSIONS_DIR, id)
    await rm(extensionPath, { recursive: true, force: true })
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_ENABLE, async (_event, id: string) => {
    await ensureExtensionsDir()
    await mkdir(join(EXTENSIONS_DIR, id), { recursive: true })
    await writeEnabledState(id, true)
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_DISABLE, async (_event, id: string) => {
    await ensureExtensionsDir()
    await mkdir(join(EXTENSIONS_DIR, id), { recursive: true })
    await writeEnabledState(id, false)
    return { ok: true }
  })

  ipcMain.handle(IPC.EXTENSION_FETCH_REGISTRY, async (_event, registryUrl: string) => {
    return fetchRegistry(registryUrl)
  })
}
