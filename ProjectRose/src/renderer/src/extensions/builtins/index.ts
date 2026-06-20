import type { RendererExtension } from '../registry'
import * as roseContacts from './rose-contacts'
import * as roseEmail from './rose-email'
import * as roseCalendar from './rose-calendar'
import * as roseRoutines from './rose-routines'
import * as roseChannels from './rose-channels'

// Built-in extensions — ship inside the host repo, register at module load,
// always enabled, cannot be uninstalled. See docs/adr/0010-built-in-extensions.md
// for the architectural contract and `rose-contacts/` for the reference
// implementation.
//
// Order in this array determines order in the App Board sidebar — built-ins
// always render before user-installed extensions.
export const BUILTIN_EXTENSIONS: RendererExtension[] = [
  {
    manifest: roseContacts.manifest,
    PageView: roseContacts.PageView,
    SettingsView: roseContacts.SettingsView,
    provenance: 'builtin'
  },
  {
    manifest: roseEmail.manifest,
    PageView: roseEmail.PageView,
    SettingsView: roseEmail.SettingsView,
    provenance: 'builtin'
  },
  {
    manifest: roseCalendar.manifest,
    PageView: roseCalendar.PageView,
    SettingsView: roseCalendar.SettingsView,
    provenance: 'builtin'
  },
  {
    manifest: roseRoutines.manifest,
    PageView: roseRoutines.PageView,
    provenance: 'builtin'
  },
  {
    manifest: roseChannels.manifest,
    PageView: roseChannels.PageView,
    SettingsView: roseChannels.SettingsView,
    provenance: 'builtin'
  }
]
