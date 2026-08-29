import { promises as fs } from 'fs'
import { join } from 'path'
import { conversationsDir } from '../lib/agentHome'
import { prPath } from '../lib/projectPaths'
import { getRecentProjects } from './recentProjects'
import {
  ensureGroupDir,
  resolveGroupDir,
  readWorkspaceMeta,
  WORKSPACE_META_FILE
} from '../lib/workspaceEncoding'
import type { ModelConfig } from '../../shared/modelConfig'
import type { TurnLogRecord } from '../../shared/turnEvents'

// Snapshot of the "compressed view" the renderer sends to the LLM in place of
// the leading portion of its api-shape messages. Persisted alongside the raw
// history so it survives restarts. All fields move together — loaders that see
// a partial shape ignore compression and use `messages`.
export interface CompressedSnapshot {
  compressedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  compressedAt: number
  compressedFromCount: number
  compressedFromRawCount: number
  compressedTurnCount?: number
}

// A Conversation is a persistent thread of Turns bound to exactly one
// Workspace. Persisted agent-global at
//   ~/.rose/conversations/<encoded-workspace>/<sessionId>/main.json
// with the real Workspace path recorded in the group's workspace.json.

export interface ConversationMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  // Absolute path of the Workspace this conversation is bound to.
  workspacePath: string
  // The provider+model pair the user picked for this Conversation in the
  // chat composer. Absent on pre-picker conversations — the composer falls
  // back to the last-used pair.
  model?: ModelConfig
}

export interface Conversation extends ConversationMeta, Partial<CompressedSnapshot> {
  messages: unknown[]
  // Highest turn-log seq already folded into `messages`. Saving with this set
  // truncates the log; on load, records at or below it are skipped. Absent on
  // conversations written before the turn log existed — those replay nothing
  // because they have no log.
  appliedSeq?: number
}

// A conversation plus whatever survived in its turn log — the events that were
// streamed after the last full save. An in-flight turn leaves records here; a
// cleanly settled one leaves none.
export interface LoadedConversation extends Conversation {
  pendingEvents: TurnLogRecord[]
}

const MIGRATION_MARKER = '.migrated-to-agent-home'

// sessionId → group directory, rebuilt lazily by listAllConversations() and on
// cache misses. Avoids re-scanning every group dir for load/save/delete.
let groupIndex: Map<string, string> | null = null

function indexSet(sessionId: string, groupDir: string): void {
  if (!groupIndex) groupIndex = new Map()
  groupIndex.set(sessionId, groupDir)
}

function mainPath(groupDir: string, sessionId: string): string {
  return join(groupDir, sessionId, 'main.json')
}

// Serialize saves per session file. Mid-turn checkpoints fire several times a
// turn and the renderer does not await them, so saves to one file overlap.
// Chaining the whole save — not just its final write — means the settling save
// issued last is also the one that lands last, and the temp-file dance below
// never races itself.
const saveQueue = new Map<string, Promise<void>>()

function enqueue(key: string, work: () => Promise<void>): Promise<void> {
  const next = (saveQueue.get(key) ?? Promise.resolve()).then(work)
  // Keep the chain alive past a failed save, and drop the entry once idle.
  const guarded = next.catch(() => {})
  saveQueue.set(key, guarded)
  return next.finally(() => {
    if (saveQueue.get(key) === guarded) saveQueue.delete(key)
  })
}

// Write via temp file + rename. A crash mid-write then leaves either the old
// file or the new one, never a truncated one — a torn main.json fails to parse
// and the loader treats the whole conversation as missing.
async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, contents, 'utf-8')
  await fs.rename(tmp, path)
}

function turnLogPath(groupDir: string, sessionId: string): string {
  return join(groupDir, sessionId, 'turn.jsonl')
}

function subagentPath(groupDir: string, sessionId: string, index: number): string {
  return join(groupDir, sessionId, `subagent${index}.json`)
}

// Scan every group dir once, returning conversation metas newest-first and
// (re)building the sessionId → group index.
export async function listAllConversations(): Promise<ConversationMeta[]> {
  const root = conversationsDir()
  const index = new Map<string, string>()
  const metas: ConversationMeta[] = []

  let groups: string[]
  try {
    groups = await fs.readdir(root)
  } catch {
    groupIndex = index
    return []
  }

  for (const group of groups) {
    const groupDir = join(root, group)
    const wsMeta = await readWorkspaceMeta(groupDir)
    if (!wsMeta) continue // not a conversation group (no workspace.json)

    let sessionDirs: string[]
    try {
      sessionDirs = await fs.readdir(groupDir)
    } catch {
      continue
    }

    for (const sessionId of sessionDirs) {
      if (sessionId === WORKSPACE_META_FILE) continue
      try {
        const raw = await fs.readFile(mainPath(groupDir, sessionId), 'utf-8')
        const s = JSON.parse(raw) as Conversation
        metas.push({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          // Prefer the group's authoritative real path over any stale value.
          workspacePath: wsMeta.path
        })
        index.set(s.id, groupDir)
      } catch {
        // skip malformed or non-session entries
      }
    }
  }

  groupIndex = index
  return metas.sort((a, b) => b.updatedAt - a.updatedAt)
}

async function resolveGroupForId(sessionId: string): Promise<string | null> {
  if (groupIndex?.has(sessionId)) return groupIndex.get(sessionId)!
  await listAllConversations() // rebuild index
  return groupIndex?.get(sessionId) ?? null
}

// Read a conversation's turn log, dropping records already folded into
// `main.json`. The final line is discarded if it does not parse: a crash
// during an append leaves a partial line, and that torn tail is exactly the
// data the log exists to bound the loss of.
async function readTurnLog(
  groupDir: string,
  sessionId: string,
  appliedSeq: number
): Promise<TurnLogRecord[]> {
  let raw: string
  try {
    raw = await fs.readFile(turnLogPath(groupDir, sessionId), 'utf-8')
  } catch {
    return [] // no log — the conversation settled cleanly
  }
  const out: TurnLogRecord[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    try {
      const rec = JSON.parse(line) as TurnLogRecord
      if (rec?.event && rec.seq > appliedSeq) out.push(rec)
    } catch {
      // Torn tail. Nothing after it can be trusted either, so stop.
      break
    }
  }
  return out.sort((a, b) => a.seq - b.seq)
}

export async function loadConversation(sessionId: string): Promise<LoadedConversation | null> {
  const groupDir = await resolveGroupForId(sessionId)
  if (!groupDir) return null
  try {
    const raw = await fs.readFile(mainPath(groupDir, sessionId), 'utf-8')
    const conversation = JSON.parse(raw) as Conversation
    // Conversations persisted by retired providers remain readable, but their
    // stale model pin is dropped so the composer uses a configured standalone
    // provider instead of trying to resolve removed credentials.
    if (
      conversation.model?.provider !== 'ollama' &&
      conversation.model?.provider !== 'openai-compatible'
    ) {
      delete conversation.model
    }
    const pendingEvents = await readTurnLog(groupDir, sessionId, conversation.appliedSeq ?? 0)
    return { ...conversation, pendingEvents }
  } catch {
    return null
  }
}

// Append streamed events to the in-flight turn's log. Shares the save queue so
// an append issued before a settling save can never land after it.
export function appendTurnEvents(
  sessionId: string,
  workspacePath: string,
  records: TurnLogRecord[]
): Promise<void> {
  if (records.length === 0) return Promise.resolve()
  return enqueue(`main:${sessionId}`, async () => {
    const groupDir = await ensureGroupDir(conversationsDir(), workspacePath)
    await fs.mkdir(join(groupDir, sessionId), { recursive: true })
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
    await fs.appendFile(turnLogPath(groupDir, sessionId), lines, 'utf-8')
    indexSet(sessionId, groupDir)
  })
}

export function saveConversation(conversation: Conversation): Promise<void> {
  return enqueue(`main:${conversation.id}`, async () => {
    const groupDir = await ensureGroupDir(conversationsDir(), conversation.workspacePath)
    await fs.mkdir(join(groupDir, conversation.id), { recursive: true })
    await writeAtomic(
      mainPath(groupDir, conversation.id),
      JSON.stringify(conversation, null, 2)
    )
    // The log's contents are now inside main.json, so drop it. Order matters:
    // a crash between the two leaves a log whose records all sit at or below
    // the saved appliedSeq, and replay skips them.
    if (conversation.appliedSeq != null) {
      await fs.rm(turnLogPath(groupDir, conversation.id), { force: true })
    }
    indexSet(conversation.id, groupDir)
  })
}

export function saveSubagentConversation(
  workspacePath: string,
  sessionId: string,
  index: number,
  conversation: Conversation
): Promise<void> {
  return enqueue(`sub:${sessionId}:${index}`, async () => {
    const groupDir = await ensureGroupDir(conversationsDir(), workspacePath)
    await fs.mkdir(join(groupDir, sessionId), { recursive: true })
    await writeAtomic(
      subagentPath(groupDir, sessionId, index),
      JSON.stringify(conversation, null, 2)
    )
    indexSet(sessionId, groupDir)
  })
}

export async function deleteConversation(sessionId: string): Promise<void> {
  const groupDir = await resolveGroupForId(sessionId)
  if (!groupDir) return
  try {
    await fs.rm(join(groupDir, sessionId), { recursive: true, force: true })
  } catch {
    // ignore
  }
  groupIndex?.delete(sessionId)
}

// ── Migration ───────────────────────────────────────────────────────────────
// One-time, non-destructive move of legacy per-workspace sessions
// (<ws>/.projectrose/sessions/...) into the agent-home store. Originals are
// left in place; a marker file short-circuits future sweeps.

interface LegacySession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages?: unknown[]
  [k: string]: unknown
}

async function readLegacySessionsDir(
  legacyDir: string
): Promise<Array<{ id: string; main: LegacySession; subagents: Array<{ index: number; data: unknown }> }>> {
  const out: Array<{ id: string; main: LegacySession; subagents: Array<{ index: number; data: unknown }> }> = []
  let entries: string[]
  try {
    entries = await fs.readdir(legacyDir)
  } catch {
    return out
  }

  for (const entry of entries) {
    // Legacy flat file: session-<uuid>.json
    if (entry.startsWith('session-') && entry.endsWith('.json')) {
      try {
        const raw = await fs.readFile(join(legacyDir, entry), 'utf-8')
        const main = JSON.parse(raw) as LegacySession
        if (main?.id) out.push({ id: main.id, main, subagents: [] })
      } catch {
        // skip
      }
      continue
    }
    // Directory-per-session layout: <uuid>/main.json (+ subagentN.json)
    try {
      const raw = await fs.readFile(join(legacyDir, entry, 'main.json'), 'utf-8')
      const main = JSON.parse(raw) as LegacySession
      if (!main?.id) continue
      const subagents: Array<{ index: number; data: unknown }> = []
      let files: string[] = []
      try {
        files = await fs.readdir(join(legacyDir, entry))
      } catch {
        // ignore
      }
      for (const f of files) {
        const m = /^subagent(\d+)\.json$/.exec(f)
        if (!m) continue
        try {
          const sraw = await fs.readFile(join(legacyDir, entry, f), 'utf-8')
          subagents.push({ index: Number(m[1]), data: JSON.parse(sraw) })
        } catch {
          // skip
        }
      }
      out.push({ id: main.id, main, subagents })
    } catch {
      // not a session dir
    }
  }
  return out
}

// Migrate one workspace's legacy sessions. Idempotent: existing targets are
// skipped, and a marker is written only on a fully clean pass. Returns the
// count of conversations newly written.
export async function migrateWorkspaceSessions(workspacePath: string): Promise<number> {
  const legacyDir = prPath(workspacePath, 'sessions')
  const markerPath = join(legacyDir, MIGRATION_MARKER)
  try {
    await fs.access(markerPath)
    return 0 // already migrated
  } catch {
    // not yet migrated
  }

  const legacy = await readLegacySessionsDir(legacyDir)
  if (legacy.length === 0) return 0

  const groupDir = await ensureGroupDir(conversationsDir(), workspacePath)
  let migrated = 0
  let allOk = true

  for (const { id, main, subagents } of legacy) {
    const target = mainPath(groupDir, id)
    try {
      await fs.access(target)
      continue // already present — idempotent skip
    } catch {
      // proceed
    }
    try {
      await fs.mkdir(join(groupDir, id), { recursive: true })
      const withWorkspace = { ...main, workspacePath }
      await fs.writeFile(target, JSON.stringify(withWorkspace, null, 2), 'utf-8')
      for (const sub of subagents) {
        await fs.writeFile(
          subagentPath(groupDir, id, sub.index),
          JSON.stringify(sub.data, null, 2),
          'utf-8'
        )
      }
      indexSet(id, groupDir)
      migrated++
    } catch {
      allOk = false
    }
  }

  if (allOk) {
    try {
      await fs.writeFile(
        markerPath,
        JSON.stringify({ migratedAt: Date.now(), count: legacy.length }, null, 2),
        'utf-8'
      )
    } catch {
      // tolerate; a re-run stays idempotent via per-session checks
    }
  }
  return migrated
}

// Sweep every known workspace (recents) at boot. Safe to call repeatedly.
export async function migrateAllKnownWorkspaces(): Promise<void> {
  const recents = getRecentProjects()
  for (const r of recents) {
    try {
      await migrateWorkspaceSessions(r.path)
    } catch {
      // skip a workspace we can't read; others still migrate
    }
  }
}

export { resolveGroupDir }
