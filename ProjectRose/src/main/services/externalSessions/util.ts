import { promises as fs } from 'fs'

// Shared helpers for the read-only external-session readers. Everything here is
// tolerant by design: a corrupted line never aborts a parse, and a missing
// store yields empty results rather than throwing.

export function safeParse(line: string): unknown | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

// Read the first and last `bytes` of a file and split each into complete lines.
// Used for cheap listing (cwd near the head, latest title near the tail)
// without parsing a multi-MB transcript. Small files are read whole.
export async function readHeadTailLines(
  filePath: string,
  bytes = 128 * 1024
): Promise<{ head: string[]; tail: string[]; whole: boolean }> {
  const handle = await fs.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    if (size <= bytes * 2) {
      const buf = Buffer.alloc(size)
      await handle.read(buf, 0, size, 0)
      const lines = buf.toString('utf-8').split(/\r?\n/)
      return { head: lines, tail: lines, whole: true }
    }
    const headBuf = Buffer.alloc(bytes)
    await handle.read(headBuf, 0, bytes, 0)
    const tailBuf = Buffer.alloc(bytes)
    await handle.read(tailBuf, 0, bytes, size - bytes)
    // Drop the first/last fragment line (likely truncated mid-line).
    const head = headBuf.toString('utf-8').split(/\r?\n/).slice(0, -1)
    const tail = tailBuf.toString('utf-8').split(/\r?\n/).slice(1)
    return { head, tail, whole: false }
  } finally {
    await handle.close()
  }
}

// Read a whole JSONL file into parsed, non-null objects (skipping bad lines).
export async function readJsonlObjects(filePath: string): Promise<Record<string, unknown>[]> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch {
    return []
  }
  const out: Record<string, unknown>[] = []
  for (const line of raw.split(/\r?\n/)) {
    const o = safeParse(line)
    if (o && typeof o === 'object') out.push(o as Record<string, unknown>)
  }
  return out
}

// Claude/Codex tool results arrive as a string or an array of content blocks
// ({type:'text', text}). Flatten to a single display string.
export function normalizeToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === 'string') return b
        if (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string') {
          return (b as { text: string }).text
        }
        return safeStringify(b)
      })
      .join('\n')
  }
  if (content == null) return ''
  return safeStringify(content)
}

export function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// First readable text in a content field. Handles a bare string, Claude's
// `{type:'text', text}` blocks, and Codex's `input_text`/`output_text` blocks —
// any block carrying a string `text` counts.
export function firstStringContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const b of content) {
      if (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string') {
        texts.push((b as { text: string }).text)
      }
    }
    if (texts.length) return texts.join('\n')
  }
  return null
}
