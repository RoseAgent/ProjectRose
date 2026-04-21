import type { ComponentType } from 'react'
import type { ExtensionManifest } from '../../../shared/extension-types'
import { manifest as discordManifest, DiscordView } from '@ext/rose-discord/renderer'
import { manifest as emailManifest, EmailView } from '@ext/rose-email/renderer'
import { manifest as gitManifest, GitView } from '@ext/rose-git/renderer'
import { manifest as dockerManifest, DockerView } from '@ext/rose-docker/renderer'
import { manifest as listenManifest, ActiveListeningView } from '@ext/rose-listen/renderer'

export interface RendererExtension {
  manifest: ExtensionManifest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PageView?: ComponentType<any>
}

const BUILTIN_EXTENSIONS: RendererExtension[] = [
  { manifest: discordManifest as ExtensionManifest, PageView: DiscordView },
  { manifest: emailManifest as ExtensionManifest,   PageView: EmailView },
  { manifest: gitManifest as ExtensionManifest,     PageView: GitView },
  { manifest: dockerManifest as ExtensionManifest,  PageView: DockerView },
  { manifest: listenManifest as ExtensionManifest,  PageView: ActiveListeningView }
]

// ViewId migration: old hardcoded nav IDs → new extension IDs
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
