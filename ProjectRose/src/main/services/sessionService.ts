import { promises as fs } from 'fs'
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

function sessionPath(rootPath: string, sessionId: string): string {
  return prPath(rootPath, 'sessions', `session-${sessionId}.json`)
}

export async function listSessions(rootPath: string): Promise<SessionMeta[]> {
  const dir = sessionsDir(rootPath)
  try {
    const entries = await fs.readdir(dir)
    const metas: SessionMeta[] = []
    for (const entry of entries) {
      if (!entry.startsWith('session-') || !entry.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(prPath(rootPath, 'sessions', entry), 'utf-8')
        const session = JSON.parse(raw) as Session
        metas.push({ id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt })
      } catch {
        // skip malformed files
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function loadSession(rootPath: string, sessionId: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(sessionPath(rootPath, sessionId), 'utf-8')
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export async function saveSession(rootPath: string, session: Session): Promise<void> {
  const dir = sessionsDir(rootPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(sessionPath(rootPath, session.id), JSON.stringify(session, null, 2), 'utf-8')
}

export async function deleteSession(rootPath: string, sessionId: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(rootPath, sessionId))
  } catch {
    // already gone
  }
}
