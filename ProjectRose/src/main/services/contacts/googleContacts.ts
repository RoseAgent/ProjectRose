import log from 'electron-log/main'
import { google, type people_v1 } from 'googleapis'
import { type OAuth2Client } from 'google-auth-library'

import type {
  ContactKind,
  GoogleApplyResult,
  GooglePullEntry,
  GooglePullPlan,
  GooglePushEntry,
  GooglePushPlan,
  GooglePushUpdate,
  GoogleSyncStatus
} from '../../../shared/contacts'
import {
  buildAuthedClient,
  googleAuthClearCredentials,
  googleAuthGetStatus,
  googleAuthSaveCredentials,
  googleAuthSignIn,
  googleAuthSignOut
} from '../google/googleAuth'

import { applySettingsPatch, readSettings } from '../settingsService'
import {
  addContactNote,
  listContacts,
  newContact,
  readContactParsed
} from './contacts'
import {
  buildPersonForCreate,
  mapPerson,
  mergeFieldsIntoPerson,
  parseBulletsToFields
} from './googleContactsMapping'

// ── Settings helpers ─────────────────────────────────────────────────────

async function readGoogleSyncSettings(): Promise<{
  lastPullAt: number | null
  lastPushAt: number | null
  syncKinds: Record<ContactKind, boolean>
}> {
  const settings = await readSettings()
  const block = settings.contacts?.googleSync
  const defaults: Record<ContactKind, boolean> = { person: true, business: true, website: false, other: false }
  return {
    lastPullAt: block?.lastPullAt ?? null,
    lastPushAt: block?.lastPushAt ?? null,
    syncKinds: { ...defaults, ...(block?.syncKinds ?? {}) }
  }
}

async function patchGoogleSyncSettings(patch: {
  lastPullAt?: number | null
  lastPushAt?: number | null
}): Promise<void> {
  const settings = await readSettings()
  const current = settings.contacts
  await applySettingsPatch({
    contacts: {
      ...current,
      googleSync: {
        ...current.googleSync,
        ...patch
      }
    }
  })
}

const PERSON_FIELDS =
  'names,emailAddresses,phoneNumbers,addresses,organizations,urls,biographies'

// ── Status / sign-in / sign-out ─────────────────────────────────────────
//
// These wrap the agent-global googleAuth module and layer contacts-specific
// timestamps on top, preserving the existing GoogleSyncStatus IPC shape.

export async function googleGetStatus(): Promise<GoogleSyncStatus> {
  const auth = await googleAuthGetStatus()
  const sync = await readGoogleSyncSettings()
  return {
    credentialsConfigured: auth.credentialsConfigured,
    credentialsBundled: auth.credentialsBundled,
    signedIn: auth.signedIn,
    accountEmail: auth.accountEmail,
    lastPullAt: sync.lastPullAt,
    lastPushAt: sync.lastPushAt
  }
}

export async function googleSaveCredentials(
  payload: { clientId: string; clientSecret: string }
): Promise<GoogleSyncStatus> {
  await googleAuthSaveCredentials(payload)
  return googleGetStatus()
}

export async function googleClearCredentials(): Promise<GoogleSyncStatus> {
  await googleAuthClearCredentials()
  return googleGetStatus()
}

export async function googleSignIn(): Promise<GoogleSyncStatus> {
  await googleAuthSignIn()
  return googleGetStatus()
}

export async function googleSignOut(): Promise<GoogleSyncStatus> {
  await googleAuthSignOut()
  return googleGetStatus()
}

// ── Pull (Google → local) ───────────────────────────────────────────────

async function listAllGooglePeople(client: OAuth2Client): Promise<people_v1.Schema$Person[]> {
  const people = google.people({ version: 'v1', auth: client })
  const out: people_v1.Schema$Person[] = []
  let pageToken: string | undefined
  do {
    const res = await people.people.connections.list({
      resourceName: 'people/me',
      personFields: PERSON_FIELDS,
      pageSize: 200,
      pageToken
    })
    if (res.data.connections) out.push(...res.data.connections)
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

export async function googlePreviewPull(): Promise<GooglePullPlan> {
  const client = await buildAuthedClient()
  if (!client) throw new Error('Not signed in to Google.')

  const settings = await readGoogleSyncSettings()
  const persons = await listAllGooglePeople(client)
  const create: GooglePullEntry[] = []
  const update: GooglePullEntry[] = []
  const skippedByKind: { entity: string; kind: ContactKind }[] = []
  let unchanged = 0

  for (const person of persons) {
    const mapped = mapPerson(person)
    if (!mapped) continue
    const existing = await readContactParsed(mapped.entity)

    if (!existing) {
      // New contact: gets default kind ('person' from mapPerson). Skip if
      // that kind isn't in the user's syncKinds set.
      if (!settings.syncKinds[mapped.kind]) {
        skippedByKind.push({ entity: mapped.entity, kind: mapped.kind })
        continue
      }
      create.push({
        entity: mapped.entity,
        kind: mapped.kind,
        googleResourceName: mapped.googleResourceName,
        newNotes: mapped.notes
      })
      continue
    }

    // Existing contact: respect its already-assigned kind.
    if (!settings.syncKinds[existing.kind]) {
      skippedByKind.push({ entity: mapped.entity, kind: existing.kind })
      continue
    }
    const existingLower = new Set(existing.notes.map((n) => n.toLowerCase()))
    const newNotes = mapped.notes.filter((n) => !existingLower.has(n.toLowerCase()))
    if (newNotes.length === 0) {
      unchanged += 1
    } else {
      update.push({
        entity: mapped.entity,
        kind: existing.kind,
        googleResourceName: mapped.googleResourceName,
        newNotes
      })
    }
  }

  return { fetched: persons.length, create, update, unchanged, skippedByKind }
}

export async function googleApplyPull(plan: GooglePullPlan): Promise<GoogleApplyResult> {
  try {
    for (const entry of plan.create) {
      await newContact(entry.entity, entry.kind)
      for (const note of entry.newNotes) {
        await addContactNote(entry.entity, note)
      }
    }
    for (const entry of plan.update) {
      for (const note of entry.newNotes) {
        await addContactNote(entry.entity, note)
      }
    }
    const appliedAt = Date.now()
    await patchGoogleSyncSettings({ lastPullAt: appliedAt })
    const total = plan.create.length + plan.update.length
    return {
      appliedAt,
      ok: true,
      message: `Pulled ${total} contact${total === 1 ? '' : 's'} (${plan.create.length} new, ${plan.update.length} updated).`
    }
  } catch (err) {
    log.error('[google-contacts] applyPull failed', err)
    return { appliedAt: Date.now(), ok: false, message: errMessage(err) }
  }
}

// ── Push (local → Google) ───────────────────────────────────────────────

export async function googlePreviewPush(): Promise<GooglePushPlan> {
  const client = await buildAuthedClient()
  if (!client) throw new Error('Not signed in to Google.')

  const settings = await readGoogleSyncSettings()
  const local = await listContacts()
  const googlePersons = await listAllGooglePeople(client)
  const googleByName = new Map<string, people_v1.Schema$Person>()
  for (const p of googlePersons) {
    const name = mapPerson(p)?.entity
    if (name) googleByName.set(name.toLowerCase(), p)
  }

  const create: GooglePushEntry[] = []
  const update: GooglePushUpdate[] = []
  const skip: { entity: string; kind: ContactKind; reason: string }[] = []
  for (const entity of local) {
    const parsed = await readContactParsed(entity)
    const kind = parsed?.kind ?? 'other'

    if (!settings.syncKinds[kind]) {
      skip.push({ entity, kind, reason: `kind '${kind}' is not enabled for sync` })
      continue
    }
    const fields = parseBulletsToFields(parsed?.notes ?? [])
    const existingGoogle = googleByName.get(entity.toLowerCase())

    if (!existingGoogle) {
      create.push({
        entity,
        kind,
        reason: 'missing-in-google',
        fields: formatFieldsPreview(fields)
      })
      continue
    }

    if (!existingGoogle.resourceName) {
      skip.push({ entity, kind, reason: 'matching Google contact has no resourceName' })
      continue
    }

    const merge = mergeFieldsIntoPerson(existingGoogle, fields)
    if (!merge) {
      skip.push({ entity, kind, reason: 'already in Google (no new fields)' })
      continue
    }
    update.push({
      entity,
      kind,
      googleResourceName: existingGoogle.resourceName,
      additions: merge.additions
    })
  }

  return { localCount: local.length, create, update, skip }
}

function formatFieldsPreview(fields: ReturnType<typeof parseBulletsToFields>): string[] {
  const out: string[] = []
  for (const e of fields.emails)    out.push(`email: ${e.value}${e.type ? ` (${e.type})` : ''}`)
  for (const p of fields.phones)    out.push(`phone: ${p.value}${p.type ? ` (${p.type})` : ''}`)
  for (const a of fields.addresses) out.push(`address: ${a.value}${a.type ? ` (${a.type})` : ''}`)
  for (const u of fields.urls)      out.push(`url: ${u.value}${u.type ? ` (${u.type})` : ''}`)
  for (const o of fields.orgs) {
    if (o.name)  out.push(`org: ${o.name}`)
    if (o.title) out.push(`title: ${o.title}`)
  }
  for (const line of fields.biographyLines) out.push(line)
  return out
}

export async function googleApplyPush(plan: GooglePushPlan): Promise<GoogleApplyResult> {
  const client = await buildAuthedClient()
  if (!client) return { appliedAt: Date.now(), ok: false, message: 'Not signed in to Google.' }

  const people = google.people({ version: 'v1', auth: client })
  let created = 0
  let updated = 0
  try {
    for (const entry of plan.create) {
      const parsed = await readContactParsed(entry.entity)
      const fields = parseBulletsToFields(parsed?.notes ?? [])
      const body = buildPersonForCreate(entry.entity, fields)
      await people.people.createContact({ requestBody: body })
      created += 1
    }
    for (const entry of plan.update) {
      const fresh = await people.people.get({
        resourceName: entry.googleResourceName,
        personFields: PERSON_FIELDS
      })
      const parsed = await readContactParsed(entry.entity)
      const fields = parseBulletsToFields(parsed?.notes ?? [])
      const merge = mergeFieldsIntoPerson(fresh.data, fields)
      if (!merge) continue // someone else added the same fields between preview and apply
      await people.people.updateContact({
        resourceName: entry.googleResourceName,
        updatePersonFields: merge.updatePersonFields,
        requestBody: merge.merged
      })
      updated += 1
    }
    const appliedAt = Date.now()
    await patchGoogleSyncSettings({ lastPushAt: appliedAt })
    const parts: string[] = []
    if (created) parts.push(`created ${created}`)
    if (updated) parts.push(`updated ${updated}`)
    const summary = parts.length ? parts.join(', ') : 'no changes'
    return {
      appliedAt,
      ok: true,
      message: `Pushed to Google: ${summary}.`
    }
  } catch (err) {
    log.error('[google-contacts] applyPush failed', err)
    return { appliedAt: Date.now(), ok: false, message: errMessage(err) }
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
