// Types for Contacts — the Agent's agent-global record of people, businesses,
// and other entities, one markdown file per entity at ~/.rose/contact/.
//
// Contacts are agent-global, not workspace-scoped — the Agent (single
// persistent identity per machine, per CONTEXT.md) carries them across every
// Workspace it operates in. Formerly part of the retired host-memory
// subsystem (ADR 0019); Contacts survive as a standalone concept.

export type { GoogleApplyResult } from './googleSync'

/**
 * Classification for a Contact entity. Stored as a `- kind: <value>` bullet
 * inside the entity's markdown file (no schema change to the file format —
 * the parser just lifts that one bullet out into a typed field). Drives the
 * Google Contacts sync filter: by default only 'person' and 'business'
 * entities round-trip with Google.
 */
export type ContactKind = 'person' | 'business' | 'website' | 'other'

export const CONTACT_KINDS: ContactKind[] = ['person', 'business', 'website', 'other']

/** A contact-entity file on disk (a person, business, website, or other). */
export interface ContactEntity {
  entity: string
  kind: ContactKind
  notes: string[]
  path: string
}

/**
 * One contact in a search result. A hit appears if at least one query matched
 * the entity name or one of its notes (case-insensitive substring).
 * `matchedQueryCount` and `totalMatches` drive ranking — higher = more
 * relevant.
 */
export interface ContactSearchHit {
  entity: string
  kind: ContactKind
  /** Distinct queries that matched somewhere on this contact. */
  matchedQueryCount: number
  /** Sum of name + note matches across every query (a query that matches both name and a note counts as 2). */
  totalMatches: number
  /** Queries that matched the entity name. */
  nameMatches: string[]
  /** Notes that matched at least one query, deduped, with the queries each note matched. */
  noteMatches: { note: string; queries: string[] }[]
  /** Full contact file markdown — supplied only when the hit's name matched a query. */
  contact: string | null
}

/**
 * Multi-query contact search result. Hits are ranked: higher
 * `matchedQueryCount` first, then higher `totalMatches`, then alphabetical
 * by entity. Hits whose name matched a query carry the full contact markdown
 * in `contact`; relation-only hits carry `contact: null`.
 */
export interface ContactSearchResult {
  queries: string[]
  hits: ContactSearchHit[]
}

/**
 * Persisted state for the rose-contacts Google Contacts sync.
 * The OAuth refresh token does NOT live here — it's sealed in
 * userData/google-session.bin via safeStorage.
 *
 * The user-supplied OAuth client pair lives separately (the clientId in
 * AppSettings.googleAuth, the clientSecret encrypted in
 * userData/google-oauth-secret.bin) — see ADR 0009.
 */
export interface GoogleSyncSettings {
  accountEmail: string | null
  lastPullAt: number | null
  lastPushAt: number | null
  /**
   * Per-kind enable map. A push only sends local entities whose kind is true
   * here; a pull only updates local entities whose existing kind is true
   * here (newly-pulled contacts default to 'person', so push/pull is mostly
   * symmetric for that case).
   */
  syncKinds: Record<ContactKind, boolean>
}

export const DEFAULT_GOOGLE_SYNC_SETTINGS: GoogleSyncSettings = {
  accountEmail: null,
  lastPullAt: null,
  lastPushAt: null,
  // Defaults match the typical Google Contacts use-case: people you know and
  // companies you deal with. Websites and "other" classifications stay local
  // unless the user opts in.
  syncKinds: { person: true, business: true, website: false, other: false }
}

/** Settings block under AppSettings.contacts. */
export interface ContactsSettings {
  googleSync: GoogleSyncSettings
}

export const DEFAULT_CONTACTS_SETTINGS: ContactsSettings = {
  googleSync: DEFAULT_GOOGLE_SYNC_SETTINGS
}

// ─── Google Contacts sync ───────────────────────────────────────────────
// All sync work is user-triggered and explicitly confirmed. There is no
// background two-way sync — the renderer asks for a `preview*` plan first,
// shows the diff in a confirm modal, then calls `apply*` on user OK.

export interface GoogleSyncStatus {
  credentialsConfigured: boolean
  // True when the running build ships its own Google OAuth pair, so the user
  // doesn't supply (or see) credential inputs. See ADR 0009 amendment.
  credentialsBundled: boolean
  signedIn: boolean
  accountEmail: string | null
  lastPullAt: number | null
  lastPushAt: number | null
}

/** A single entity that will be created or updated locally on pull. */
export interface GooglePullEntry {
  entity: string                    // safe Contact entity name
  kind: ContactKind                 // resolved kind (existing or default 'person')
  googleResourceName: string        // People API resourceName
  newNotes: string[]                // bullet notes that will be appended
}

export interface GooglePullPlan {
  fetched: number
  create: GooglePullEntry[]
  update: GooglePullEntry[]
  unchanged: number
  /** Existing locals skipped because their current kind isn't in syncKinds. */
  skippedByKind: { entity: string; kind: ContactKind }[]
}

/** A single Contact entity that will be created in Google. */
export interface GooglePushEntry {
  entity: string
  kind: ContactKind
  reason: 'missing-in-google'
  /**
   * Bullet-formatted preview of what's being sent (e.g. `email: x@y (work)`,
   * `phone: 555 (mobile)`, biography lines). Empty if the contact has only
   * a name. Shown in the confirm modal.
   */
  fields: string[]
}

/** A Contact entity that's already in Google and has extra local fields. */
export interface GooglePushUpdate {
  entity: string
  kind: ContactKind
  /** People API resourceName, used by apply to target the right Google contact. */
  googleResourceName: string
  /**
   * Bullet-formatted list of fields that will be appended to Google. Computed
   * additively — Google's existing fields are never removed or overwritten.
   */
  additions: string[]
}

export interface GooglePushPlan {
  localCount: number
  create: GooglePushEntry[]
  update: GooglePushUpdate[]
  skip: { entity: string; kind: ContactKind; reason: string }[]
}
