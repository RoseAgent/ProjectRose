import type { ComponentType } from 'react'
import type { ExtensionManifest } from '../../../shared/extension-types'
import { DiscordView } from '../components/DiscordView/DiscordView'
import { EmailView } from '../components/EmailView/EmailView'
import { GitView } from '../components/GitView/GitView'
import { DockerView } from '../components/DockerView/DockerView'
import { ActiveListeningView } from '../components/ActiveListeningView/ActiveListeningView'

export interface RendererExtension {
  manifest: ExtensionManifest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PageView?: ComponentType<any>
}

const BUILTIN_EXTENSIONS: RendererExtension[] = [
  {
    manifest: {
      id: 'rose-discord',
      name: 'Discord',
      version: '1.0.0',
      description: 'Discord channel integration and messaging',
      author: 'ProjectRose',
      navItem: { label: 'Discord', iconName: 'discord' },
      provides: { pageView: true, globalSettings: true, agentTools: true }
    },
    PageView: DiscordView
  },
  {
    manifest: {
      id: 'rose-email',
      name: 'Email',
      version: '1.0.0',
      description: 'IMAP email management',
      author: 'ProjectRose',
      navItem: { label: 'Email', iconName: 'email' },
      provides: { pageView: true, globalSettings: true, agentTools: true }
    },
    PageView: EmailView
  },
  {
    manifest: {
      id: 'rose-git',
      name: 'Git',
      version: '1.0.0',
      description: 'Git repository management',
      author: 'ProjectRose',
      navItem: { label: 'Git', iconName: 'git' },
      provides: { pageView: true }
    },
    PageView: GitView
  },
  {
    manifest: {
      id: 'rose-docker',
      name: 'Docker',
      version: '1.0.0',
      description: 'Docker container management',
      author: 'ProjectRose',
      navItem: { label: 'Docker', iconName: 'docker' },
      provides: { pageView: true }
    },
    PageView: DockerView
  },
  {
    manifest: {
      id: 'rose-listen',
      name: 'Listen',
      version: '1.0.0',
      description: 'Active listening with speaker diarization',
      author: 'ProjectRose',
      navItem: { label: 'Listen', iconName: 'listen' },
      provides: { pageView: true, globalSettings: true }
    },
    PageView: ActiveListeningView
  }
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
