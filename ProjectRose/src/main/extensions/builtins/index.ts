// Main-process registration for built-in extensions.
//
// Per ADR 0010, built-in extensions ship inside the host repo. Their renderer
// halves are statically wired up in
// `src/renderer/src/extensions/builtins/index.ts`; this module is the parallel
// scaffolding for their main-process halves.
//
// Built-in main modules are now always-on and owned by the main process
// (ADR 0017): `startAlwaysOnRuntimes()` loads every Workspace with enabled
// rules at boot, and `ensureRuntimeFor()` (via
// `window.api.extension.ensureBuiltinMains`) brings one online on demand when a
// Conversation binds a Workspace or a rule is saved. Each built-in with
// `provides.main: true` is asked to `register(ctx)` with a context built via
// the same `buildContext()` machinery dynamic extensions use, so manifest
// capability gating continues to apply uniformly. `loadAllBuiltinMains` is
// idempotent per (rootPath, id); `unloadAllBuiltinMains` remains for teardown
// but is no longer called on Conversation switch — runtimes stay up.
//
// Adding a new built-in with a main module:
//   1. Drop its main module into `src/main/extensions/builtins/<id>/main.ts`
//      exporting `register(ctx, options): () => void`.
//   2. Import it here and add an entry to `BUILTIN_MAINS`.
//   3. Make sure its renderer manifest declares the matching capabilities.

import { buildHostSurface } from '../../services/extensionService'
import { buildContext, type HostExtensionSurface } from '../buildContext'
import type { ExtensionManifest } from '../../../shared/extension-types'
import type { ExtensionMainContext } from '../../../shared/extension-contract'

import * as roseRoutines from './rose-routines/main'
import * as roseChannels from './rose-channels/main'

interface BuiltinMain {
  id: string
  manifest: ExtensionManifest
  register: (ctx: ExtensionMainContext) => (() => void) | void
}

// One row per built-in that ships a main module. Renderer-only built-ins
// (rose-contacts, rose-calendar today) do NOT appear here.
const BUILTIN_MAINS: BuiltinMain[] = [
  {
    id: roseRoutines.manifest.id,
    manifest: roseRoutines.manifest,
    register: roseRoutines.register
  },
  {
    id: roseChannels.manifest.id,
    manifest: roseChannels.manifest,
    register: roseChannels.register
  }
]

// `${rootPath}/${id}` -> cleanup function returned from the built-in's
// register(). Used so a Workspace switch can tear down the previous
// workspace's main modules before loading the new one's.
const loadedCleanups = new Map<string, () => void>()

/**
 * Load every built-in main module for the given Workspace. Idempotent per
 * `(rootPath, id)`: calling twice with the same rootPath is a no-op for
 * built-ins already loaded against it.
 */
export async function loadAllBuiltinMains(rootPath: string): Promise<void> {
  if (!rootPath) return
  for (const entry of BUILTIN_MAINS) {
    const key = `${rootPath}/${entry.id}`
    if (loadedCleanups.has(key)) continue
    try {
      const host: HostExtensionSurface = buildHostSurface(rootPath, entry.id, key, entry.manifest)
      const ctx = buildContext({
        extensionId: entry.id,
        manifest: entry.manifest,
        host
      })
      const cleanup = entry.register(ctx)
      loadedCleanups.set(key, typeof cleanup === 'function' ? cleanup : () => {})
    } catch (err) {
      console.error(`[builtin-ext] Failed to register ${entry.id} main for ${rootPath}:`, err)
    }
  }
}

/**
 * Unload every built-in main module previously loaded for this Workspace.
 * Called on Workspace switch (the next openProject in the renderer triggers
 * a fresh load against the new path).
 */
export function unloadAllBuiltinMains(rootPath: string): void {
  if (!rootPath) return
  for (const [key, cleanup] of loadedCleanups) {
    if (!key.startsWith(`${rootPath}/`)) continue
    try {
      cleanup()
    } catch (err) {
      console.error('[builtin-ext] cleanup error:', err)
    }
    loadedCleanups.delete(key)
  }
}

/** Names of the built-ins that have main modules. Used by the install dialog. */
export function listBuiltinMainIds(): string[] {
  return BUILTIN_MAINS.map((b) => b.id)
}

// `listBuiltinMainManifests` lives in `./manifests.ts` (manifest-only,
// no electron-pulling imports) so it can be consumed from vitest-targeted
// code paths like projectSettingsService without dragging the runtime
// chain in. Don't re-export it from here.
