import type { ComponentType } from 'react'
import type { ExtensionManifest } from '../../../shared/extension-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RendererExtension {
  manifest: ExtensionManifest
  PageView?: ComponentType<any>
}

// Extensions are installed at runtime — nothing is bundled into the core app.
const BUILTIN_EXTENSIONS: RendererExtension[] = []

const VIEW_ID_MIGRATIONS: Record<string, string> = {
  discord: 'rose-discord',
  email: 'rose-email',
  git: 'rose-git',
  docker: 'rose-docker',
  activeListening: 'rose-listen'
}

export function migrateViewId(viewId: string): string {
  return VIEW_ID_MIGRATIONS[viewId] ?? viewId
}

export function getExtensionByViewId(viewId: string): RendererExtension | undefined {
  return BUILTIN_EXTENSIONS.find((e) => e.manifest.id === viewId)
}

export function getAllExtensions(): RendererExtension[] {
  return BUILTIN_EXTENSIONS
}

export function getExtensionNavItems(): Array<{ viewId: string; label: string }> {
  return BUILTIN_EXTENSIONS
    .filter((e) => e.manifest.navItem)
    .map((e) => ({
      viewId: e.manifest.id,
      label: e.manifest.navItem!.label
    }))
}
