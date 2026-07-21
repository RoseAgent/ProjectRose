// Parse and serialize Contact bullet-note files.
//
// Contacts live on disk as markdown:
//
//   # Entity: Jane Doe
//   - kind: person
//   - email: jane@x.com (work)
//   - phone: +1 555-1234 (mobile)
//   - Met at the 2025 offsite. Likes hiking.
//
// The `# Entity:` header and `- kind:` bullet are owned by the host (contacts.ts).
// Everything below is a list of bullets. A subset of those bullets carry
// recognized labels (`email`, `phone`, `address`, `url`, `org`, `title`);
// anything else is freeform biography.
//
// This module is the single source of truth for that bullet shape — used by:
//   • the rose-contacts built-in extension's per-field editor (renderer)
//   • googleContactsMapping.ts for Google sync push/pull (main)
//
// Pure functions only, no IO — safe to import from either process.

import type { ContactKind } from './contacts'

export interface LabeledValue {
  value: string
  type: string | null
}

export interface ParsedLocalFields {
  emails: LabeledValue[]
  phones: LabeledValue[]
  addresses: LabeledValue[]
  urls: LabeledValue[]
  /**
   * Org/title pairs are reconstructed positionally — the Nth title in the
   * file attaches to the Nth org. Most contacts have at most one of each, so
   * this lossy pairing is fine in practice.
   */
  orgs: { name: string; title?: string }[]
  /** Bullets that didn't match any structured label. */
  biographyLines: string[]
}

export const CONTACT_FIELD_LABELS = ['email', 'phone', 'address', 'url', 'org', 'title'] as const
type Label = typeof CONTACT_FIELD_LABELS[number]

function tryParseLabeled(line: string): { label: Label; value: string; type: string | null } | null {
  // Match `label: rest` (case-insensitive on the label), then peel a trailing
  // `(type)` off the value if present. Non-greedy on the value so the trailing
  // parens win the last set of parens on the line.
  const m = line.match(/^\s*([a-z]+)\s*:\s*(.+?)\s*$/i)
  if (!m) return null
  const label = m[1].toLowerCase() as Label
  if (!CONTACT_FIELD_LABELS.includes(label)) return null
  const rest = m[2]
  const typed = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (typed) return { label, value: typed[1].trim(), type: typed[2].trim() }
  return { label, value: rest.trim(), type: null }
}

export function parseBulletsToFields(notes: string[]): ParsedLocalFields {
  const out: ParsedLocalFields = {
    emails: [], phones: [], addresses: [], urls: [], orgs: [], biographyLines: []
  }
  const orgNames: string[] = []
  const orgTitles: string[] = []
  for (const note of notes) {
    const parsed = tryParseLabeled(note)
    if (!parsed) {
      const text = note.trim()
      if (text) out.biographyLines.push(text)
      continue
    }
    switch (parsed.label) {
      case 'email':   out.emails.push({ value: parsed.value, type: parsed.type }); break
      case 'phone':   out.phones.push({ value: parsed.value, type: parsed.type }); break
      case 'address': out.addresses.push({ value: parsed.value, type: parsed.type }); break
      case 'url':     out.urls.push({ value: parsed.value, type: parsed.type }); break
      case 'org':     orgNames.push(parsed.value); break
      case 'title':   orgTitles.push(parsed.value); break
    }
  }
  // Zip orgs with titles positionally. Extra titles attach to a synthetic
  // empty-name org so the title isn't dropped.
  const maxOrg = Math.max(orgNames.length, orgTitles.length)
  for (let i = 0; i < maxOrg; i += 1) {
    const name = orgNames[i] ?? ''
    const title = orgTitles[i]
    if (!name && !title) continue
    out.orgs.push(title ? { name, title } : { name })
  }
  return out
}

function emitLabeled(label: Label, lv: LabeledValue): string | null {
  const value = lv.value.trim()
  if (!value) return null
  const type = (lv.type ?? '').trim()
  return type ? `${label}: ${value} (${type})` : `${label}: ${value}`
}

/**
 * Inverse of parseBulletsToFields. Emits labeled bullets in LABELS order
 * (email, phone, address, url, org, title), then biography lines verbatim.
 * Empty values are dropped — the editor uses empty rows as placeholders.
 *
 * The org/title positional pairing is preserved: every org emits its `org:`
 * bullet followed by a `title:` bullet if present, so a parse→serialize
 * round-trip lines them up the same way next time.
 */
export function serializeFieldsToBullets(fields: ParsedLocalFields): string[] {
  const out: string[] = []
  for (const e of fields.emails) {
    const line = emitLabeled('email', e)
    if (line) out.push(line)
  }
  for (const p of fields.phones) {
    const line = emitLabeled('phone', p)
    if (line) out.push(line)
  }
  for (const a of fields.addresses) {
    const line = emitLabeled('address', a)
    if (line) out.push(line)
  }
  for (const u of fields.urls) {
    const line = emitLabeled('url', u)
    if (line) out.push(line)
  }
  for (const o of fields.orgs) {
    const name = o.name.trim()
    const title = (o.title ?? '').trim()
    if (!name && !title) continue
    if (name) out.push(`org: ${name}`)
    if (title) out.push(`title: ${title}`)
  }
  for (const line of fields.biographyLines) {
    const trimmed = line.trim()
    if (trimmed) out.push(trimmed)
  }
  return out
}

const ENTITY_HEADER_RE = /^\s*#\s*Entity:\s*(.+?)\s*$/i
const KIND_LINE_RE = /^\s*-\s+kind:\s*(person|business|website|other)\s*$/i
const BULLET_LINE_RE = /^\s*-\s+(.*?)\s*$/

export interface ParsedContact {
  /** Name from the `# Entity:` header, or null if the header is missing. */
  entityName: string | null
  /** Kind from the `- kind:` bullet; defaults to 'other' if absent. */
  kind: ContactKind
  /** Parsed bullets (all bullets except the kind line). */
  fields: ParsedLocalFields
}

/**
 * Parse a full contact-file content string into header + kind + structured
 * fields. The kind bullet is consumed and lifted to a typed field; every
 * other bullet flows through parseBulletsToFields. Non-bullet lines (and
 * blank lines) are discarded — the canonical file format puts everything
 * after the header in bullets.
 */
export function parseContactContent(content: string): ParsedContact {
  let entityName: string | null = null
  let kind: ContactKind = 'other'
  let kindSeen = false
  const bullets: string[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    if (entityName === null) {
      const m = rawLine.match(ENTITY_HEADER_RE)
      if (m) { entityName = m[1].trim(); continue }
    }
    if (!kindSeen) {
      const m = rawLine.match(KIND_LINE_RE)
      if (m) { kind = m[1].toLowerCase() as ContactKind; kindSeen = true; continue }
    }
    const bm = rawLine.match(BULLET_LINE_RE)
    if (bm) bullets.push(bm[1])
  }

  return { entityName, kind, fields: parseBulletsToFields(bullets) }
}

/**
 * Build a canonical contact-file content string from a name + kind + fields.
 * Output shape:
 *
 *   # Entity: <name>
 *   - kind: <kind>
 *   - email: ...
 *   - phone: ...
 *   - <freeform line>
 *
 * Always ends with a trailing newline. The order matches what the host's
 * contacts.ts writer produces, so a parse→build round-trip stabilises after
 * one write.
 */
export function buildContactMarkdown(
  name: string,
  kind: ContactKind,
  fields: ParsedLocalFields
): string {
  const bullets = serializeFieldsToBullets(fields)
  const lines: string[] = [
    `# Entity: ${name}`,
    `- kind: ${kind}`,
    ...bullets.map((b) => `- ${b}`)
  ]
  return lines.join('\n') + '\n'
}
