import type { ComponentType } from 'react'
import type { ExtensionManifest } from '../../../shared/extension-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RendererExtension {
  manifest: ExtensionManifest
  PageView?: ComponentType<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SettingsView?: ComponentType<any>
}

// All extensions are loaded dynamically at runtime from the installed list.
const DYNAMIC_EXTENSIONS: RendererExtension[] = []

// Listeners notified whenever DYNAMIC_EXTENSIONS changes.
const _changeListeners = new Set<() => void>()

export function subscribeToExtensionsChange(cb: () => void): () => void {
  _changeListeners.add(cb)
  return () => { _changeListeners.delete(cb) }
}

const VIEW_ID_MIGRATIONS: Record<string, string> = {
  discord: 'rose-discord',
  email: 'rose-email',
  git: 'rose-git',
  docker: 'rose-docker',
  activeListening: 'rose-listen',
  heartbeat: 'rose-heartbeat'
}

export function migrateViewId(viewId: string): string {
  return VIEW_ID_MIGRATIONS[viewId] ?? viewId
}

export function getExtensionByViewId(viewId: string): RendererExtension | undefined {
  const id = VIEW_ID_MIGRATIONS[viewId] ?? viewId
  return DYNAMIC_EXTENSIONS.find((e) => e.manifest.id === id)
}

export function getAllExtensions(): RendererExtension[] {
  return [...DYNAMIC_EXTENSIONS]
}

export function getExtensionNavItems(): Array<{ viewId: string; label: string }> {
  return DYNAMIC_EXTENSIONS
    .filter((e) => e.manifest.navItem)
    .map((e) => ({
      viewId: e.manifest.id,
      label: e.manifest.navItem!.label
    }))
}

/**
 * Scans installed extensions and dynamically loads each one's renderer.js
 * (compiled at packaging time).  The bundle is evaluated with a custom
 * require() that routes all @renderer/* and react imports to the host app's
 * live instances via window.__rose__.  Extensions must export `PageView` as
 * a named export from their renderer.ts entry point.
 */
export async function loadDynamicExtensions(rootPath: string): Promise<void> {
  DYNAMIC_EXTENSIONS.length = 0

  if (!rootPath) {
    _changeListeners.forEach((fn) => fn())
    return
  }

  const { installed } = await window.api.extension.list(rootPath)

  for (const ext of installed.filter((e) => e.enabled)) {
    try {
      const result = await window.api.extension.loadRendererCode(rootPath, ext.manifest.id)
      if (!result.ok || !result.code) continue

      const mod: { exports: Record<string, unknown> } = { exports: {} }
      const requireFn = (id: string): unknown => window.__rose__?.[id] ?? {}

      // Execute the CJS bundle produced by the packaging script
      // eslint-disable-next-line no-new-func
      new Function('module', 'exports', 'require', result.code)(mod, mod.exports, requireFn)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PageView = (mod.exports['PageView'] ?? mod.exports['default']) as ComponentType<any> | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SettingsView = mod.exports['SettingsView'] as ComponentType<any> | undefined
      if (typeof PageView === 'function' || typeof SettingsView === 'function') {
        DYNAMIC_EXTENSIONS.push({ manifest: ext.manifest, PageView, SettingsView })
      }

      // Load the extension's main-process module (if it declares one)
      if (ext.manifest.provides.main) {
        await window.api.extension.loadMainModule(rootPath, ext.manifest.id).catch(() => {})
      }
    } catch (err) {
      console.error(`[rose-ext] Failed to load extension ${ext.manifest.id}:`, err)
    }
  }

  _changeListeners.forEach((fn) => fn())
}
