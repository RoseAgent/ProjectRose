import { stat } from 'fs/promises'
import type {
  ExternalSessionMeta,
  ExternalSource,
  ExternalTranscript,
  ExternalTranscriptUpdate
} from '../../../shared/externalSession'
import { listClaudeSessions, readClaudeTranscript } from './claudeReader'
import { listCodexSessions, readCodexTranscript } from './codexReader'

// Aggregates the read-only external-session readers. Absence of either store
// (no `~/.claude` / no `~/.codex`) simply yields fewer results — never an
// error. Nothing here ever writes to a foreign store.

// filePath lookup for getTranscript, populated by the last listExternalSessions.
const filePathById = new Map<string, string>()

function key(source: ExternalSource, id: string): string {
  return `${source}:${id}`
}

export async function listExternalSessions(): Promise<ExternalSessionMeta[]> {
  const [claude, codex] = await Promise.all([listClaudeSessions(), listCodexSessions()])
  const all = [...claude, ...codex]
  filePathById.clear()
  for (const m of all) filePathById.set(key(m.source, m.id), m.filePath)
  return all
}

async function resolveFilePath(source: ExternalSource, id: string): Promise<string | null> {
  let filePath = filePathById.get(key(source, id))
  if (!filePath) {
    // Cache miss (e.g. first call after boot) — rebuild the index once.
    await listExternalSessions()
    filePath = filePathById.get(key(source, id))
  }
  return filePath ?? null
}

export async function getExternalTranscript(
  source: ExternalSource,
  id: string
): Promise<ExternalTranscript | null> {
  const filePath = await resolveFilePath(source, id)
  if (!filePath) return null
  try {
    return source === 'claude-code'
      ? await readClaudeTranscript(filePath)
      : await readCodexTranscript(filePath)
  } catch {
    return null
  }
}

/**
 * Poll-friendly transcript read: re-parses only when the on-disk file has
 * changed since `sinceMtimeMs`, otherwise returns null after a cheap stat.
 * Lets the viewer follow a session another CLI is actively appending to
 * (e.g. a resumed Claude run in the background terminal).
 */
export async function getExternalTranscriptUpdate(
  source: ExternalSource,
  id: string,
  sinceMtimeMs: number
): Promise<ExternalTranscriptUpdate | null> {
  const filePath = await resolveFilePath(source, id)
  if (!filePath) return null
  try {
    const st = await stat(filePath)
    if (st.mtimeMs <= sinceMtimeMs) return null
    const transcript =
      source === 'claude-code'
        ? await readClaudeTranscript(filePath)
        : await readCodexTranscript(filePath)
    return { transcript, mtimeMs: st.mtimeMs }
  } catch {
    return null
  }
}
