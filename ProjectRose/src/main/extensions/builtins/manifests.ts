// Manifest-only registry for built-ins with main modules. Imports the
// per-extension `manifest.ts` files (which have zero electron / runtime
// dependencies) so consumers like `projectSettingsService.listTools` can
// read the declared tools at module-load time without dragging the full
// main.ts modules (and their electron / tray imports) into vitest's node
// environment.
//
// `BUILTIN_MAINS` in `./index.ts` is the runtime list that also wires the
// `register` callbacks; this file is its data-only twin. They must stay in
// lockstep — adding a new built-in with a main module means appending here
// AND to `BUILTIN_MAINS`.

import type { ExtensionManifest } from '../../../shared/extension-types'
import { manifest as roseRoutinesManifest } from './rose-routines/manifest'
import { manifest as roseChannelsManifest } from './rose-channels/manifest'

const BUILTIN_MAIN_MANIFESTS: readonly ExtensionManifest[] = [
  roseRoutinesManifest,
  roseChannelsManifest
]

/** Manifests of every built-in that has a main module. */
export function listBuiltinMainManifests(): readonly ExtensionManifest[] {
  return BUILTIN_MAIN_MANIFESTS
}
