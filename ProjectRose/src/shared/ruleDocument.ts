// Shared scaffolding for the rose-routines (ADR 0013) and rose-channels
// (ADR 0015) on-disk markdown formats, which intentionally mirror each other:
//
//   # <Header>: <name>
//   - label: value          (flat metadata bullets)
//   - tools:                (optional indented sub-list)
//     - tool_a
//     - tool_b
//
//   ## Prompt               (free-form `## …` sections)
//   …
//
// Unrecognised bullets are preserved verbatim for round-trip. Each consumer
// maps the generic labeled bullets to its own typed fields and supplies its own
// ordered metadata bullets on build; the line-walking, tools handling, section
// walk, and emission live here so a fix lands once instead of drifting between
// the two formats.
//
// Pure functions only, no IO — safe to import from either process.

const BULLET_RE = /^(\s*)-\s+(.*?)\s*$/
const SECTION_RE = /^\s*##\s+(.+?)\s*$/
const LABEL_RE = /^([a-z][a-z0-9-]*)\s*:\s*(.*?)\s*$/i

export interface LabeledBullet {
  /** Lowercased label, guaranteed to be one of the supplied known labels (never `tools`). */
  label: string
  /** Trimmed value text after the colon. */
  value: string
}

export interface ParsedRuleDocument {
  /** The `# <Header>:` name. */
  name: string
  /** Recognised metadata bullets in file order, excluding the `tools` list. */
  labeled: LabeledBullet[]
  /** Flattened tool names from inline (`tools: a, b`) and/or sub-list form. */
  tools: string[]
  /** Bullets the parser did not recognise. Preserved verbatim for round-trip. */
  extraBullets: string[]
  /** Body sections keyed by `## header`. */
  sections: Record<string, string>
}

/**
 * Parse the shared rule-document skeleton. `headerRe` must capture the name in
 * group 1; `knownLabels` is the set of metadata labels this format recognises
 * (include `tools` to enable the tool list — its values land in `.tools`, not
 * `.labeled`).
 */
export function parseRuleDocument(
  content: string,
  headerRe: RegExp,
  knownLabels: readonly string[]
): ParsedRuleDocument {
  const known = new Set(knownLabels.map((l) => l.toLowerCase()))
  const labeled: LabeledBullet[] = []
  const tools: string[] = []
  const extraBullets: string[] = []
  const sections: Record<string, string> = {}
  let name = ''
  const lines = content.split(/\r?\n/)
  let i = 0
  let inToolsList = false
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    if (!name) {
      const h = line.match(headerRe)
      if (h) {
        name = h[1].trim()
        continue
      }
    }
    if (SECTION_RE.test(line)) break
    const bm = line.match(BULLET_RE)
    if (!bm) {
      inToolsList = false
      continue
    }
    const indent = bm[1].length
    const bullet = bm[2]
    // Indented bullets continue the most recent list. Today the only list-
    // bearing label is `tools:`.
    if (inToolsList && indent >= 2) {
      const value = bullet.trim()
      if (value.length > 0) tools.push(value)
      continue
    }
    inToolsList = false
    const m = bullet.match(LABEL_RE)
    if (!m || !known.has(m[1].toLowerCase())) {
      extraBullets.push(bullet)
      continue
    }
    const label = m[1].toLowerCase()
    const value = m[2].trim()
    if (label === 'tools') {
      // Either inline `tools: a, b, c` or the start of an indented sub-list.
      if (value.length === 0) {
        inToolsList = true
      } else {
        for (const t of value.split(',').map((s) => s.trim()).filter(Boolean)) tools.push(t)
      }
      continue
    }
    labeled.push({ label, value })
  }

  // Section walk over the remaining lines.
  let currentHeader: string | null = null
  let buffer: string[] = []
  const flush = (): void => {
    if (!currentHeader) return
    sections[currentHeader] = buffer.join('\n').trim()
    buffer = []
  }
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    const sm = line.match(SECTION_RE)
    if (sm) {
      flush()
      currentHeader = sm[1].trim()
      continue
    }
    if (currentHeader) buffer.push(line)
  }
  flush()

  return { name, labeled, tools, extraBullets, sections }
}

/**
 * Serialize the shared skeleton. `metadataBullets` are the consumer's ordered
 * `- label: value` lines (without the tools list); this appends the `tools`
 * sub-list, the preserved unknown bullets, then the sections (Prompt first,
 * then the rest alphabetically), with a trailing newline.
 */
export function buildRuleDocument(args: {
  headerLine: string
  metadataBullets: string[]
  tools: string[]
  extraBullets: string[]
  sections: Record<string, string>
}): string {
  const lines: string[] = [args.headerLine, ...args.metadataBullets]
  if (args.tools.length > 0) {
    lines.push('- tools:')
    for (const t of args.tools) lines.push(`  - ${t}`)
  }
  for (const extra of args.extraBullets) lines.push(`- ${extra}`)

  // Sections — Prompt first if present, then any others alphabetically.
  const entries = Object.entries(args.sections).filter(([, body]) => body.trim().length > 0)
  entries.sort((a, b) => {
    if (a[0] === 'Prompt') return -1
    if (b[0] === 'Prompt') return 1
    return a[0].localeCompare(b[0])
  })
  for (const [header, body] of entries) {
    lines.push('', `## ${header}`, body.trim())
  }
  return lines.join('\n') + '\n'
}

export function parseBoolean(value: string): boolean {
  const lower = value.trim().toLowerCase()
  return lower === 'true' || lower === 'yes' || lower === '1'
}

/** Slugify a display name for an on-disk filename, falling back to `fallback`. */
export function slugify(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\p{Letter}\p{Number}\s-]+/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  )
}
