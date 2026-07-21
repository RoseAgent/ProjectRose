import type { ExtensionManifest } from '@shared/extension-types'

export const manifest: ExtensionManifest = {
  id: 'rose-calendar',
  name: 'Calendar',
  version: '1.0.0',
  description: 'Calendar events — create, edit, list, and round-trip with Google Calendar.',
  author: 'ProjectRose',
  latin: 'Eventus',
  provides: {
    pageView: true,
    globalSettings: true,
    agentTools: true
  }
}
