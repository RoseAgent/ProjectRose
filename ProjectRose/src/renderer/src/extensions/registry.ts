import type { ComponentType } from 'react'
import type { ExtensionManifest } from '../../../shared/extension-types'
import { manifest as discordManifest, DiscordView } from '@ext/rose-discord/renderer'
import { manifest as dockerManifest, DockerView } from '@ext/rose-docker/renderer'
import { manifest as emailManifest, EmailView } from '@ext/rose-email/renderer'
import { manifest as gitManifest, GitView } from '@ext/rose-git/renderer'
import { manifest as listenManifest, ActiveListeningView } from '@ext/rose-listen/renderer'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RendererExtension {
  manifest: ExtensionManifest
  PageView?: ComponentType<any>
}

const BUILTIN_EXTENSIONS: RendererExtension[] = [
  { manifest: discordManifest as ExtensionManifest, PageView: DiscordView },
  { manifest: dockerManifest as ExtensionManifest, PageView: DockerView },
  { manifest: emailManifest as ExtensionManifest, PageView: EmailView },
  { manifest: gitManifest as ExtensionManifest, PageView: GitView },
  { manifest: listenManifest as ExtensionManifest, PageView: ActiveListeningView },
]

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
  const id = VIEW_ID_MIGRATIONS[viewId] ?? viewId
  return BUILTIN_EXTENSIONS.find((e) => e.manifest.id === id)
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
