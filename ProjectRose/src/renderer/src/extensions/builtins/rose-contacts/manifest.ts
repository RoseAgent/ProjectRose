import type { ExtensionManifest } from '@shared/extension-types'

export const manifest: ExtensionManifest = {
  id: 'rose-contacts',
  name: 'Contacts',
  version: '1.6.0',
  description: 'Contacts — list, edit, and round-trip with Google Contacts.',
  author: 'ProjectRose',
  latin: 'Contactus',
  provides: {
    pageView: true,
    globalSettings: true
  }
}
