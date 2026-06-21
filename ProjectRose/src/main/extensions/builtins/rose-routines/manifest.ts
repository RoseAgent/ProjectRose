// Main-side manifest for rose-routines, kept in its own module so the
// project-settings service can read the declared tools without pulling in
// `main.ts` (which transitively imports electron / tray and breaks the
// vitest node environment).
//
// Must stay byte-for-byte equivalent to the renderer-side manifest at
// `src/renderer/src/extensions/builtins/rose-routines/manifest.ts`.

import type { ExtensionManifest } from '@shared/extension-types'

export const manifest: ExtensionManifest = {
  id: 'rose-routines',
  name: 'Routines',
  version: '1.0.0',
  description:
    'Recurring prompts that fire the Agent on a calendar schedule. Each fire is saved for audit.',
  author: 'ProjectRose',
  latin: 'Rota',
  navItem: { label: 'Routines', iconName: 'clock' },
  provides: {
    pageView: true,
    main: true,
    detachedRunWithTools: true,
    notifyStatus: true,
    broadcast: true
  }
}
