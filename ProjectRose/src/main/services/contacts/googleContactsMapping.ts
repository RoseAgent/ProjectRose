// Pure mapping between Google People API resources and Contact bullet
// notes. Kept free of IO so it can be unit-tested without electron/fs.
//
// The contract (see ADR 0008 + push update support):
//   - Google's structured fields flatten into labelled bullets:
//       - email: jane@x.com (work)
//       - phone: +1 555-1234 (mobile)
//       - address: 123 Main St, Brooklyn NY (home)
//       - org: Acme
//       - title: CEO
//       - url: https://acme.example (homepage)
//   - Anything else is a biography line (free-text notes).
//   - The `- kind: <value>` bullet is stripped by contacts.ts before we see
//     it here.
//
// This file goes both ways:
//   - Pull: flattenPersonToNotes(person) → bullets that addContactNote dedups
//     into the Contact file.
//   - Push: parseBulletsToFields(notes) → structured fields that get sent to
//     Google's People API as a new Person (createContact) or merged into an
//     existing Person (updateContact).

import type { people_v1 } from 'googleapis'
import type { ContactKind } from '../../../shared/contacts'
import type { ParsedLocalFields } from '../../../shared/contactFields'

export type { ParsedLocalFields } from '../../../shared/contactFields'
export { parseBulletsToFields } from '../../../shared/contactFields'

/** Single Person resource as the People API returns it. */
export type GooglePerson = people_v1.Schema$Person

/** What the agent stores about one Google contact. */
export interface MappedContact {
  /** Display name (used as the Contact entity filename). */
  entity: string
  /**
   * Kind newly-pulled contacts get. Per user spec we always default to
   * 'person' on pull (Google's API has no equivalent field) and let the
   * user reclassify in the editor afterwards.
   */
  kind: ContactKind
  /** People API resourceName, kept for future bidirectional updates. */
  googleResourceName: string
  /** Bullet-note lines, each ready to be passed to addContactNote(). */
  notes: string[]
}

/**
 * Pick a primary display name from the Google Person. Falls back through
 * displayName → familyName + givenName → first email local-part → null.
 * Returning null tells the caller to skip the contact (un-nameable).
 */
export function pickDisplayName(person: GooglePerson): string | null {
  const names = person.names ?? []
  const primary = names.find((n) => n.metadata?.primary) ?? names[0]
  if (primary?.displayName?.trim()) return primary.displayName.trim()
  if (primary?.givenName || primary?.familyName) {
    return [primary.givenName, primary.familyName].filter(Boolean).join(' ').trim() || null
  }
  const email = (person.emailAddresses ?? [])[0]?.value
  if (email) return email.split('@')[0]
  return null
}

function labelled(type: string | null | undefined, value: string): string {
  const t = (type ?? '').trim()
  return t ? `${value} (${t})` : value
}

/**
 * Flatten one Google Person into bullet-note lines. The list deduplicates
 * within itself (Google sometimes returns duplicate email/phone entries
 * across primary/secondary metadata).
 */
export function flattenPersonToNotes(person: GooglePerson): string[] {
  const out: string[] = []
  const push = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (!out.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) out.push(trimmed)
  }

  for (const e of person.emailAddresses ?? []) {
    if (e.value) push(`email: ${labelled(e.type, e.value)}`)
  }
  for (const p of person.phoneNumbers ?? []) {
    if (p.value) push(`phone: ${labelled(p.type, p.value)}`)
  }
  for (const a of person.addresses ?? []) {
    const formatted = (a.formattedValue ?? '').replace(/\s+/g, ' ').trim()
    if (formatted) push(`address: ${labelled(a.type, formatted)}`)
  }
  for (const o of person.organizations ?? []) {
    if (o.name) push(`org: ${o.name}`)
    if (o.title) push(`title: ${o.title}`)
  }
  for (const u of person.urls ?? []) {
    if (u.value) push(`url: ${labelled(u.type, u.value)}`)
  }
  for (const b of person.biographies ?? []) {
    const text = (b.value ?? '').trim()
    if (text) {
      // Biographies are user-authored prose; split on newlines so each line
      // becomes its own bullet rather than one giant note.
      for (const line of text.split(/\r?\n/)) {
        const line2 = line.trim()
        if (line2) push(line2)
      }
    }
  }
  return out
}

export function mapPerson(person: GooglePerson): MappedContact | null {
  const entity = pickDisplayName(person)
  if (!entity) return null
  if (!person.resourceName) return null
  return {
    entity,
    kind: 'person',
    googleResourceName: person.resourceName,
    notes: flattenPersonToNotes(person)
  }
}

// ── Push side: bullets → Google Person fields ───────────────────────────
//
// Parser + interface moved to src/shared/contactFields.ts so the rose-contacts
// extension editor and this Google-sync layer share one source of truth for
// the bullet format. This file re-exports them at the top so external callers
// (including tests) that imported from here keep working.

/** Build a brand-new Person body for createContact. */
export function buildPersonForCreate(name: string, fields: ParsedLocalFields): GooglePerson {
  const person: GooglePerson = {
    names: [{ givenName: name }]
  }
  if (fields.emails.length) {
    person.emailAddresses = fields.emails.map((e) => ({
      value: e.value, ...(e.type ? { type: e.type } : {})
    }))
  }
  if (fields.phones.length) {
    person.phoneNumbers = fields.phones.map((p) => ({
      value: p.value, ...(p.type ? { type: p.type } : {})
    }))
  }
  if (fields.addresses.length) {
    person.addresses = fields.addresses.map((a) => ({
      formattedValue: a.value, ...(a.type ? { type: a.type } : {})
    }))
  }
  if (fields.urls.length) {
    person.urls = fields.urls.map((u) => ({
      value: u.value, ...(u.type ? { type: u.type } : {})
    }))
  }
  if (fields.orgs.length) {
    person.organizations = fields.orgs.map((o) => ({
      ...(o.name ? { name: o.name } : {}),
      ...(o.title ? { title: o.title } : {})
    }))
  }
  if (fields.biographyLines.length) {
    person.biographies = [{ value: fields.biographyLines.join('\n') }]
  }
  return person
}

// ── Merge (push update path) ────────────────────────────────────────────

export interface MergeResult {
  /**
   * Full Person body to send to updateContact. Includes Google's existing
   * entries on each field plus any new local entries (additive merge — never
   * removes or overwrites Google's data).
   */
  merged: GooglePerson
  /** Field mask covering only the fields we're touching. */
  updatePersonFields: string
  /** Human-readable list of what's being added, for the confirm modal. */
  additions: string[]
}

const FIELD_MASK_ALL = 'emailAddresses,phoneNumbers,addresses,urls,organizations,biographies'

function normEmail(v: string): string { return v.trim().toLowerCase() }
function normPhone(v: string): string { return v.replace(/\D+/g, '') }
function normUrl(v: string): string { return v.trim().toLowerCase().replace(/\/+$/, '') }
function normAddress(v: string): string { return v.replace(/\s+/g, ' ').trim().toLowerCase() }
function normOrg(v: string): string { return v.trim().toLowerCase() }

/**
 * Build a Person body whose every list field contains Google's existing
 * entries followed by any local entries that aren't already present (by
 * normalised key — see norm* helpers above). Returns the additions list as
 * formatted bullet strings so the confirm modal can show them verbatim.
 *
 * Returns null if no additions would be made — the caller skips the update.
 */
export function mergeFieldsIntoPerson(
  person: GooglePerson,
  fields: ParsedLocalFields
): MergeResult | null {
  const additions: string[] = []

  const existingEmailKeys = new Set((person.emailAddresses ?? []).map((e) => normEmail(e.value ?? '')))
  const mergedEmails = [...(person.emailAddresses ?? [])]
  for (const e of fields.emails) {
    const k = normEmail(e.value)
    if (!k || existingEmailKeys.has(k)) continue
    existingEmailKeys.add(k)
    mergedEmails.push({ value: e.value, ...(e.type ? { type: e.type } : {}) })
    additions.push(`email: ${e.value}${e.type ? ` (${e.type})` : ''}`)
  }

  const existingPhoneKeys = new Set((person.phoneNumbers ?? []).map((p) => normPhone(p.value ?? '')))
  const mergedPhones = [...(person.phoneNumbers ?? [])]
  for (const p of fields.phones) {
    const k = normPhone(p.value)
    if (!k || existingPhoneKeys.has(k)) continue
    existingPhoneKeys.add(k)
    mergedPhones.push({ value: p.value, ...(p.type ? { type: p.type } : {}) })
    additions.push(`phone: ${p.value}${p.type ? ` (${p.type})` : ''}`)
  }

  const existingAddrKeys = new Set((person.addresses ?? []).map((a) => normAddress(a.formattedValue ?? '')))
  const mergedAddrs = [...(person.addresses ?? [])]
  for (const a of fields.addresses) {
    const k = normAddress(a.value)
    if (!k || existingAddrKeys.has(k)) continue
    existingAddrKeys.add(k)
    mergedAddrs.push({ formattedValue: a.value, ...(a.type ? { type: a.type } : {}) })
    additions.push(`address: ${a.value}${a.type ? ` (${a.type})` : ''}`)
  }

  const existingUrlKeys = new Set((person.urls ?? []).map((u) => normUrl(u.value ?? '')))
  const mergedUrls = [...(person.urls ?? [])]
  for (const u of fields.urls) {
    const k = normUrl(u.value)
    if (!k || existingUrlKeys.has(k)) continue
    existingUrlKeys.add(k)
    mergedUrls.push({ value: u.value, ...(u.type ? { type: u.type } : {}) })
    additions.push(`url: ${u.value}${u.type ? ` (${u.type})` : ''}`)
  }

  // Orgs are keyed by (name, title) together since the pair is the unit a
  // user thinks about ("CEO at Acme" vs "CFO at Acme").
  const orgKey = (name: string | null | undefined, title: string | null | undefined): string =>
    `${normOrg(name ?? '')}|${normOrg(title ?? '')}`
  const existingOrgKeys = new Set((person.organizations ?? []).map((o) => orgKey(o.name, o.title)))
  const mergedOrgs = [...(person.organizations ?? [])]
  for (const o of fields.orgs) {
    const k = orgKey(o.name, o.title)
    if (existingOrgKeys.has(k)) continue
    if (!o.name && !o.title) continue
    existingOrgKeys.add(k)
    mergedOrgs.push({
      ...(o.name ? { name: o.name } : {}),
      ...(o.title ? { title: o.title } : {})
    })
    if (o.name) additions.push(`org: ${o.name}`)
    if (o.title) additions.push(`title: ${o.title}`)
  }

  // Biographies: collect Google's existing lines (split on newlines, as we do
  // on pull) and append any local lines missing from that set. The result is
  // a single biography entry with the merged text — Google's data model
  // tolerates multiple entries, but our round-trip is cleaner with one.
  const googleBioText = (person.biographies ?? []).map((b) => (b.value ?? '').trim()).filter(Boolean).join('\n')
  const googleBioLines = new Set(googleBioText.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean))
  const bioAdditions: string[] = []
  for (const line of fields.biographyLines) {
    const k = line.trim().toLowerCase()
    if (!k || googleBioLines.has(k)) continue
    googleBioLines.add(k)
    bioAdditions.push(line)
  }
  let mergedBios = person.biographies ?? []
  if (bioAdditions.length) {
    const combined = googleBioText
      ? `${googleBioText}\n${bioAdditions.join('\n')}`
      : bioAdditions.join('\n')
    mergedBios = [{ value: combined }]
    for (const line of bioAdditions) additions.push(line)
  }

  if (additions.length === 0) return null

  const merged: GooglePerson = {
    ...(person.resourceName ? { resourceName: person.resourceName } : {}),
    ...(person.etag ? { etag: person.etag } : {}),
    emailAddresses: mergedEmails,
    phoneNumbers: mergedPhones,
    addresses: mergedAddrs,
    urls: mergedUrls,
    organizations: mergedOrgs,
    biographies: mergedBios
  }
  return { merged, updatePersonFields: FIELD_MASK_ALL, additions }
}
