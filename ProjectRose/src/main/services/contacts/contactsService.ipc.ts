import { defineIpc, method } from '../../../shared/ipc/defineIpc'
import type {
  ContactEntity,
  ContactKind,
  ContactSearchResult,
  GoogleApplyResult,
  GooglePullPlan,
  GooglePushPlan,
  GoogleSyncStatus
} from '../../../shared/contacts'

// IPC manifest for Contacts (~/.rose/contact/). Bound flat on
// window.api.contacts.* — see src/preload/index.ts.

export const contactsIpc = defineIpc('contacts', {
  listContacts: method<[], string[]>(),
  listContactsDetailed: method<[], Array<{ entity: string; kind: ContactKind }>>(),
  readContact: method<[entity: string], string | null>(),
  writeContact: method<[payload: { entity: string; content: string }], void>(),
  deleteContact: method<[entity: string], void>(),
  newContact: method<[entity: string], ContactEntity>(),
  addContactNote: method<[payload: { entity: string; note: string }], ContactEntity>(),
  removeContactNote: method<[payload: { entity: string; note: string }], ContactEntity | null>(),
  setContactKind: method<[payload: { entity: string; kind: ContactKind }], ContactEntity>(),
  searchContacts: method<[queries: string[]], ContactSearchResult>(),

  // Google Contacts sync. Each direction is a two-step preview/apply so the
  // renderer can show a dry-run modal before any write happens.
  //
  // saveCredentials / clearCredentials manage the BYO OAuth pair the user
  // pastes into Settings → Providers → Google (see ADR 0009). signOut wipes
  // only the refresh token; clearCredentials wipes both halves of the pair.
  googleGetStatus: method<[], GoogleSyncStatus>(),
  googleSaveCredentials: method<[payload: { clientId: string; clientSecret: string }], GoogleSyncStatus>(),
  googleClearCredentials: method<[], GoogleSyncStatus>(),
  googleSignIn: method<[], GoogleSyncStatus>(),
  googleSignOut: method<[], GoogleSyncStatus>(),
  googlePreviewPull: method<[], GooglePullPlan>(),
  googleApplyPull: method<[plan: GooglePullPlan], GoogleApplyResult>(),
  googlePreviewPush: method<[], GooglePushPlan>(),
  googleApplyPush: method<[plan: GooglePushPlan], GoogleApplyResult>()
})
