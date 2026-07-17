import type {
  ExternalSessionMeta,
  ExternalSource,
  ExternalTranscript
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

export async function getExternalTranscript(
  source: ExternalSource,
  id: string
): Promise<ExternalTranscript | null> {
  let filePath = filePathById.get(key(source, id))
  if (!filePath) {
    // Cache miss (e.g. first call after boot) — rebuild the index once.
    await listExternalSessions()
    filePath = filePathById.get(key(source, id))
  }
  if (!filePath) return null
  try {
    return source === 'claude-code'
      ? await readClaudeTranscript(filePath)
      : await readCodexTranscript(filePath)
  } catch {
    return null
  }
}
