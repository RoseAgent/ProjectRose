import type { ComponentType } from 'react'
import type { ExtensionManifest } from '../../../shared/extension-types'
import { legacyViewIdAliases } from '../../../shared/extension-contract'
import { BUILTIN_EXTENSIONS } from './builtins'

/**
 * 'builtin'  — ships inside the host repo, statically registered, always
 *              enabled, cannot be uninstalled. See builtins/index.ts.
 * 'dynamic'  — installed by the user from disk or git, loaded at runtime
 *              via loadRendererCode().
 */
export type ExtensionProvenance = 'builtin' | 'dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RendererExtension {
  manifest: ExtensionManifest
  PageView?: ComponentType<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SettingsView?: ComponentType<any>
  provenance?: ExtensionProvenance
}

// User-installed extensions are loaded dynamically at runtime from the
// installed list. Built-ins live in BUILTIN_EXTENSIONS (imported above)
// and are merged ahead of dynamic ones in getAllExtensions().
const DYNAMIC_EXTENSIONS: RendererExtension[] = []

// Listeners notified whenever DYNAMIC_EXTENSIONS changes.
const _changeListeners = new Set<() => void>()

export function subscribeToExtensionsChange(cb: () => void): () => void {
  _changeListeners.add(cb)
  return () => { _changeListeners.delete(cb) }
}

// The legacy viewId map now lives on the contract module
// (`legacyViewIdAliases`). The renderer just consults it here. New
// extensions get id-equals-viewId for free; this table only services
// projects upgraded from a pre-namespaced install. See the contract
// module for the documented retirement plan.

export function migrateViewId(viewId: string): string {
  return legacyViewIdAliases[viewId] ?? viewId
}

export function getExtensionByViewId(viewId: string): RendererExtension | undefined {
  const id = legacyViewIdAliases[viewId] ?? viewId
  return (
    BUILTIN_EXTENSIONS.find((e) => e.manifest.id === id) ??
    DYNAMIC_EXTENSIONS.find((e) => e.manifest.id === id)
  )
}

export function getAllExtensions(): RendererExtension[] {
  return [...BUILTIN_EXTENSIONS, ...DYNAMIC_EXTENSIONS]
}

const STYLE_DATA_ATTR = 'data-rose-extension'

function clearExtensionStyles(): void {
  document.querySelectorAll(`style[${STYLE_DATA_ATTR}]`).forEach((el) => el.remove())
}

function injectExtensionStyle(extensionId: string, css: string): void {
  const style = document.createElement('style')
  style.setAttribute(STYLE_DATA_ATTR, extensionId)
  style.textContent = css
  document.head.appendChild(style)
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
  clearExtensionStyles()

  if (!rootPath) {
    _changeListeners.forEach((fn) => fn())
    return
  }

  // Built-in main modules (rose-routines / rose-channels) are now started by
  // the main process — at boot for every Workspace with enabled rules, and on
  // demand via ensureRuntimeFor when a Conversation binds a Workspace or a rule
  // is saved (ADR 0017). The renderer no longer drives their lifecycle, so a
  // Conversation switch never flaps their sockets/schedulers.
  await window.api.extension.ensureBuiltinMains(rootPath).catch(() => {})

  const { installed } = await window.api.extension.list(rootPath)

  for (const ext of installed.filter((e) => e.enabled)) {
    try {
      const result = await window.api.extension.loadRendererCode(rootPath, ext.manifest.id)
      if (result.ok && result.code) {
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
          DYNAMIC_EXTENSIONS.push({ manifest: ext.manifest, PageView, SettingsView, provenance: 'dynamic' })
          if (result.css) injectExtensionStyle(ext.manifest.id, result.css)
        }
      }

      // Load the extension's main-process module — independent of renderer code,
      // since main-only extensions (e.g. chat-hook-only) ship no renderer.js.
      if (ext.manifest.provides.main) {
        await window.api.extension.loadMainModule(rootPath, ext.manifest.id).catch(() => {})
      }
    } catch (err) {
      console.error(`[rose-ext] Failed to load extension ${ext.manifest.id}:`, err)
    }
  }

  _changeListeners.forEach((fn) => fn())
}
