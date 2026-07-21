import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises'
import { agentContactDir } from '../../lib/agentHome'
import type { ContactEntity, ContactKind, ContactSearchHit, ContactSearchResult } from '../../../shared/contacts'
import { contactPath, safeEntityName } from './paths'

// File format per the user's spec, plus one typed line lifted from the bullet
// list:
//
//   # Entity: **Name**
//   - kind: person
//   - first note
//   - second note
//
// The kind line is a regular bullet at write-time so anything that reads the
// file as plain markdown (a human, the agent's prompt) sees it as just one
// more note. parseFile() extracts the first matching `- kind: <value>` line
// into a typed `kind` field; everything else stays in `notes`. Files that
// don't have a kind bullet yet (anything created before this change)
// default to 'other' on read and gain the bullet the next time they're
// rewritten.

const KIND_RE = /^kind:\s*(person|business|website|other)\s*$/i

function entityHeader(entity: string): string {
  return `# Entity: ${entity}`
}

function buildFile(entity: string, kind: ContactKind, notes: string[]): string {
  const lines = [entityHeader(entity), `- kind: ${kind}`]
  for (const n of notes) {
    const trimmed = n.trim()
    if (!trimmed) continue
    // Tolerate someone passing the kind bullet back in via addContactNote —
    // the typed kind field is authoritative.
    if (KIND_RE.test(trimmed)) continue
    lines.push(`- ${trimmed}`)
  }
  return lines.join('\n') + '\n'
}

function parseFile(entity: string, content: string): ContactEntity {
  let kind: ContactKind = 'other'
  let kindFound = false
  const notes: string[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*-\s+(.+?)\s*$/)
    if (!m) continue
    const bullet = m[1]
    if (!kindFound) {
      const km = bullet.match(KIND_RE)
      if (km) {
        kind = km[1].toLowerCase() as ContactKind
        kindFound = true
        continue
      }
    }
    notes.push(bullet)
  }
  return { entity, kind, notes, path: contactPath(entity) }
}

export async function listContacts(): Promise<string[]> {
  let files: string[]
  try { files = await readdir(agentContactDir()) } catch { return [] }
  return files
    .filter((f) => f.endsWith('.md') && f !== '.gitkeep')
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Like listContacts(), but reads each file to extract its kind. Used by the
 * Settings > Contacts list so it can show "[person]" / "[business]" badges
 * without N round-trips from the renderer. The contact dir is small enough
 * that an O(N) read pass at list time is cheap compared to N IPC calls.
 */
export async function listContactsDetailed(): Promise<Array<{ entity: string; kind: ContactKind }>> {
  const names = await listContacts()
  const out: Array<{ entity: string; kind: ContactKind }> = []
  for (const name of names) {
    const parsed = await readContactParsed(name)
    out.push({ entity: name, kind: parsed?.kind ?? 'other' })
  }
  return out
}

export async function readContact(entity: string): Promise<string | null> {
  const safe = safeEntityName(entity)
  if (!safe) return null
  try { return await readFile(contactPath(safe), 'utf-8') } catch { return null }
}

export async function readContactParsed(entity: string): Promise<ContactEntity | null> {
  const safe = safeEntityName(entity)
  if (!safe) return null
  const raw = await readContact(safe)
  if (raw === null) return null
  return parseFile(safe, raw)
}

export async function writeContact(entity: string, content: string): Promise<void> {
  const safe = safeEntityName(entity)
  if (!safe) throw new Error('Invalid entity name')
  await mkdir(agentContactDir(), { recursive: true })
  await writeFile(contactPath(safe), content, 'utf-8')
}

export async function deleteContact(entity: string): Promise<void> {
  const safe = safeEntityName(entity)
  if (!safe) return
  await unlink(contactPath(safe)).catch(() => { /* tolerate */ })
}

/**
 * Create a new contact. Manual creation defaults to 'other' so the user is
 * nudged to classify. Pull-from-Google passes `kind: 'person'` explicitly.
 */
export async function newContact(
  entity: string,
  kind: ContactKind = 'other'
): Promise<ContactEntity> {
  const safe = safeEntityName(entity)
  if (!safe) throw new Error('Invalid entity name')
  await mkdir(agentContactDir(), { recursive: true })
  const existing = await readContactParsed(safe)
  if (existing) return existing
  await writeFile(contactPath(safe), buildFile(safe, kind, []), 'utf-8')
  return { entity: safe, kind, notes: [], path: contactPath(safe) }
}

export async function addContactNote(entity: string, note: string): Promise<ContactEntity> {
  const safe = safeEntityName(entity)
  if (!safe) throw new Error('Invalid entity name')
  const trimmed = note.trim()
  if (!trimmed) throw new Error('Empty note')
  await mkdir(agentContactDir(), { recursive: true })
  const current = await readContactParsed(safe)
  const kind = current?.kind ?? 'other'
  const notes = current ? [...current.notes] : []
  if (!notes.some((n) => n.toLowerCase() === trimmed.toLowerCase())) notes.push(trimmed)
  await writeFile(contactPath(safe), buildFile(safe, kind, notes), 'utf-8')
  return { entity: safe, kind, notes, path: contactPath(safe) }
}

export async function removeContactNote(entity: string, note: string): Promise<ContactEntity | null> {
  const safe = safeEntityName(entity)
  if (!safe) return null
  const current = await readContactParsed(safe)
  if (!current) return null
  const target = note.trim().toLowerCase()
  const notes = current.notes.filter((n) => n.trim().toLowerCase() !== target)
  await writeFile(contactPath(safe), buildFile(safe, current.kind, notes), 'utf-8')
  return { entity: safe, kind: current.kind, notes, path: contactPath(safe) }
}

/**
 * Update the kind of an existing contact. If the file doesn't exist yet, it's
 * created with the given kind and no notes (mirrors newContact's behaviour).
 */
export async function setContactKind(entity: string, kind: ContactKind): Promise<ContactEntity> {
  const safe = safeEntityName(entity)
  if (!safe) throw new Error('Invalid entity name')
  await mkdir(agentContactDir(), { recursive: true })
  const current = await readContactParsed(safe)
  const notes = current?.notes ?? []
  await writeFile(contactPath(safe), buildFile(safe, kind, notes), 'utf-8')
  return { entity: safe, kind, notes, path: contactPath(safe) }
}

/**
 * Multi-query contact search. For each query (case-insensitive substring), we
 * check every contact's entity name and notes. A contact becomes a hit if at
 * least one query matched anywhere. Hits are ranked by how many distinct
 * queries matched (primary), total match count across name + notes (tiebreak),
 * then entity name alphabetical.
 *
 * Done as a directory walk + per-file read; the contact dir is small enough
 * that a proper text-search index would be overkill.
 */
export async function searchContacts(queries: string[]): Promise<ContactSearchResult> {
  const trimmed = queries.map((q) => q.trim()).filter((q) => q.length > 0)
  const dedup: string[] = []
  const seen = new Set<string>()
  for (const q of trimmed) {
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(q)
  }
  if (dedup.length === 0) return { queries: [], hits: [] }

  const lowered = dedup.map((q) => q.toLowerCase())
  const names = await listContacts()
  const hits: ContactSearchHit[] = []

  for (const name of names) {
    const file = await readContact(name)
    if (!file) continue
    const parsed = parseFile(name, file)
    const lowerName = name.toLowerCase()
    const lowerNotes = parsed.notes.map((n) => n.toLowerCase())

    const nameMatches: string[] = []
    const noteHitsByIndex = new Map<number, string[]>()
    let totalMatches = 0

    for (let i = 0; i < dedup.length; i++) {
      const q = dedup[i]
      const lq = lowered[i]
      if (lowerName.includes(lq)) {
        nameMatches.push(q)
        totalMatches += 1
      }
      for (let j = 0; j < parsed.notes.length; j++) {
        if (lowerNotes[j].includes(lq)) {
          const existing = noteHitsByIndex.get(j) ?? []
          existing.push(q)
          noteHitsByIndex.set(j, existing)
          totalMatches += 1
        }
      }
    }

    const matchedQuerySet = new Set<string>(nameMatches)
    const noteMatches: { note: string; queries: string[] }[] = []
    for (const [idx, qs] of [...noteHitsByIndex.entries()].sort((a, b) => a[0] - b[0])) {
      noteMatches.push({ note: parsed.notes[idx], queries: qs })
      for (const q of qs) matchedQuerySet.add(q)
    }

    if (matchedQuerySet.size === 0) continue

    hits.push({
      entity: name,
      kind: parsed.kind,
      matchedQueryCount: matchedQuerySet.size,
      totalMatches,
      nameMatches,
      noteMatches,
      contact: nameMatches.length > 0 ? file : null
    })
  }

  hits.sort((a, b) => {
    if (b.matchedQueryCount !== a.matchedQueryCount) return b.matchedQueryCount - a.matchedQueryCount
    if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches
    return a.entity.localeCompare(b.entity)
  })

  return { queries: dedup, hits }
}
