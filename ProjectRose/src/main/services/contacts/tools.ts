// Host tool handlers for Contacts. Same signature as toolHandlers.ts —
// (input, projectRoot, toolCtx) => Promise<string> — so they can be wrapped
// by `wrapExecute` and registered in buildCoreTools.

import {
  addContactNote,
  newContact,
  readContact,
  removeContactNote,
  searchContacts,
  setContactKind
} from './contacts'
import { CONTACT_KINDS, type ContactKind } from '../../../shared/contacts'

// Helper to coerce string args.
function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asKind(v: unknown): ContactKind | null {
  if (typeof v !== 'string') return null
  const lower = v.toLowerCase()
  return (CONTACT_KINDS as string[]).includes(lower) ? (lower as ContactKind) : null
}

export async function handleContactsNew(input: Record<string, unknown>): Promise<string> {
  const entity = asString(input.entity)
  if (!entity) return 'Missing `entity`.'
  const kind = asKind(input.kind) ?? 'other'
  const result = await newContact(entity, kind)
  return `Contact ready: ${result.entity} (${result.kind})`
}

export async function handleContactsSetKind(input: Record<string, unknown>): Promise<string> {
  const entity = asString(input.entity)
  const kind = asKind(input.kind)
  if (!entity) return 'Missing `entity`.'
  if (!kind) return `Missing or invalid \`kind\`. Use one of: ${CONTACT_KINDS.join(', ')}.`
  const result = await setContactKind(entity, kind)
  return `${result.entity} classified as ${result.kind}.`
}

export async function handleContactsRead(input: Record<string, unknown>): Promise<string> {
  const entity = asString(input.entity)
  if (!entity) return 'Missing `entity`.'
  const content = await readContact(entity)
  return content ?? `No contact named "${entity}".`
}

export async function handleContactsSearch(input: Record<string, unknown>): Promise<string> {
  const raw = input.queries
  if (!Array.isArray(raw)) return 'Missing `queries` (string[]).'
  const queries = raw.filter((q): q is string => typeof q === 'string')
  if (queries.length === 0) return 'Missing `queries` (string[]).'
  const result = await searchContacts(queries)
  return JSON.stringify(result, null, 2)
}

export async function handleContactsAddNote(input: Record<string, unknown>): Promise<string> {
  const entity = asString(input.entity)
  const note = asString(input.note)
  if (!entity || !note) return 'Missing `entity` or `note`.'
  const result = await addContactNote(entity, note)
  return `Added note to ${result.entity}. Notes now: ${result.notes.length}.`
}

export async function handleContactsRemoveNote(input: Record<string, unknown>): Promise<string> {
  const entity = asString(input.entity)
  const note = asString(input.note)
  if (!entity || !note) return 'Missing `entity` or `note`.'
  const result = await removeContactNote(entity, note)
  if (!result) return `No contact named "${entity}".`
  return `Removed note from ${result.entity}. Notes remaining: ${result.notes.length}.`
}
