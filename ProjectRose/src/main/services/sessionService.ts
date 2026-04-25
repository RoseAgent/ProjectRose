import { promises as fs } from 'fs'
import { join } from 'path'
import { prPath } from '../lib/projectPaths'

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface Session extends SessionMeta {
  messages: unknown[]
}

function sessionsDir(rootPath: string): string {
  return prPath(rootPath, 'sessions')
}

// New directory-per-session layout
function sessionDir(rootPath: string, sessionId: string): string {
  return join(sessionsDir(rootPath), sessionId)
}

function mainSessionPath(rootPath: string, sessionId: string): string {
  return join(sessionDir(rootPath, sessionId), 'main.json')
}

function subagentSessionPath(rootPath: string, sessionId: string, index: number): string {
  return join(sessionDir(rootPath, sessionId), `subagent${index}.json`)
}

export async function listSessions(rootPath: string): Promise<SessionMeta[]> {
  const dir = sessionsDir(rootPath)
  const metas: SessionMeta[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  for (const entry of entries) {
    // New layout: entry is a UUID directory containing main.json
    if (!entry.startsWith('session-')) {
      try {
        const raw = await fs.readFile(join(dir, entry, 'main.json'), 'utf-8')
        const s = JSON.parse(raw) as Session
        metas.push({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt })
      } catch {
        // skip malformed or non-session directories
      }
      continue
    }
    // Legacy flat file: session-{uuid}.json
    if (entry.endsWith('.json')) {
      try {
        const raw = await fs.readFile(join(dir, entry), 'utf-8')
        const s = JSON.parse(raw) as Session
        metas.push({ id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt })
      } catch {
        // skip malformed files
      }
    }
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadSession(rootPath: string, sessionId: string): Promise<Session | null> {
  // Try new directory layout first
  try {
    const raw = await fs.readFile(mainSessionPath(rootPath, sessionId), 'utf-8')
    return JSON.parse(raw) as Session
  } catch {
    // fall through to legacy
  }
  // Backward compat: legacy flat file
  try {
    const raw = await fs.readFile(prPath(rootPath, 'sessions', `session-${sessionId}.json`), 'utf-8')
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export async function saveSession(rootPath: string, session: Session): Promise<void> {
  const dir = sessionDir(rootPath, session.id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(mainSessionPath(rootPath, session.id), JSON.stringify(session, null, 2), 'utf-8')
}

export async function saveSubagentSession(
  rootPath: string,
  sessionId: string,
  index: number,
  session: Session
): Promise<void> {
  const dir = sessionDir(rootPath, sessionId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(subagentSessionPath(rootPath, sessionId, index), JSON.stringify(session, null, 2), 'utf-8')
}

export async function deleteSession(rootPath: string, sessionId: string): Promise<void> {
  // Remove new directory layout
  try {
    await fs.rm(sessionDir(rootPath, sessionId), { recursive: true, force: true })
  } catch {
    // ignore
  }
  // Also clean up legacy flat file if it exists
  try {
    await fs.unlink(prPath(rootPath, 'sessions', `session-${sessionId}.json`))
  } catch {
    // ignore
  }
}
