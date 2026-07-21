import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// conversationsDir() and getRecentProjects() are the store's only environment
// dependencies — point them at per-test temp dirs.
let CONV_DIR = ''
let RECENTS: Array<{ path: string; name: string; lastOpened: number }> = []

vi.mock('../../lib/agentHome', () => ({ conversationsDir: () => CONV_DIR }))
vi.mock('../recentProjects', () => ({ getRecentProjects: () => RECENTS }))

import {
  saveConversation,
  appendTurnEvents,
  loadConversation,
  listAllConversations,
  deleteConversation,
  migrateWorkspaceSessions,
  migrateAllKnownWorkspaces,
  type Conversation
} from '../conversationStore'
import { readWorkspaceMeta } from '../../lib/workspaceEncoding'
import type { TurnLogRecord } from '../../../shared/turnEvents'

let base: string

beforeEach(async () => {
  base = await fs.mkdtemp(join(tmpdir(), 'conv-store-'))
  CONV_DIR = join(base, 'conversations')
  RECENTS = []
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

function conv(id: string, workspacePath: string, extra: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: `title-${id}`,
    createdAt: 1,
    updatedAt: 1,
    workspacePath,
    messages: [{ role: 'user', content: 'hi' }],
    ...extra
  }
}

describe('save / load / list', () => {
  it('round-trips a conversation and preserves workspacePath', async () => {
    const ws = join(base, 'proj-a')
    await saveConversation(conv('id-1', ws))
    const loaded = await loadConversation('id-1')
    expect(loaded?.id).toBe('id-1')
    expect(loaded?.workspacePath).toBe(ws)
    expect(loaded?.messages).toHaveLength(1)
  })

  it('lists conversations newest-first with workspacePath from workspace.json', async () => {
    const ws = join(base, 'proj-a')
    await saveConversation(conv('old', ws, { updatedAt: 10 }))
    await saveConversation(conv('new', ws, { updatedAt: 20 }))
    const metas = await listAllConversations()
    expect(metas.map((m) => m.id)).toEqual(['new', 'old'])
    expect(metas.every((m) => m.workspacePath === ws)).toBe(true)
  })

  it('groups two workspaces into two group dirs', async () => {
    await saveConversation(conv('a', join(base, 'proj-a')))
    await saveConversation(conv('b', join(base, 'proj-b')))
    const groups = await fs.readdir(CONV_DIR)
    expect(groups).toHaveLength(2)
    const metas = await listAllConversations()
    expect(metas).toHaveLength(2)
  })

  // Mid-turn checkpoints write the same file repeatedly without awaiting, so
  // the write must be atomic (no torn main.json) and serialized.
  it('leaves no temp file behind and lands the last of overlapping writes', async () => {
    const ws = join(base, 'proj-a')
    await Promise.all([
      saveConversation(conv('id-1', ws, { title: 'first' })),
      saveConversation(conv('id-1', ws, { title: 'second' })),
      saveConversation(conv('id-1', ws, { title: 'third' }))
    ])
    const loaded = await loadConversation('id-1')
    expect(loaded?.title).toBe('third')
    const groups = await fs.readdir(CONV_DIR)
    const files = await fs.readdir(join(CONV_DIR, groups[0], 'id-1'))
    expect(files).toEqual(['main.json'])
  })

  it('deletes a conversation without touching siblings', async () => {
    const ws = join(base, 'proj-a')
    await saveConversation(conv('keep', ws))
    await saveConversation(conv('drop', ws))
    await deleteConversation('drop')
    expect(await loadConversation('drop')).toBeNull()
    expect(await loadConversation('keep')).not.toBeNull()
  })

  it('returns null for an unknown id', async () => {
    expect(await loadConversation('nope')).toBeNull()
  })
})

describe('turn log', () => {
  const ws = () => join(base, 'proj-a')

  async function logFile(sessionId: string): Promise<string> {
    const groups = await fs.readdir(CONV_DIR)
    return join(CONV_DIR, groups[0], sessionId, 'turn.jsonl')
  }

  const rec = (seq: number, token: string): TurnLogRecord => ({
    seq,
    event: { kind: 'token', token }
  })

  it('surfaces appended events as pending on the next load', async () => {
    await saveConversation(conv('id-1', ws()))
    await appendTurnEvents('id-1', ws(), [rec(1, 'a'), rec(2, 'b')])
    const loaded = await loadConversation('id-1')
    expect(loaded?.pendingEvents.map((r) => r.event)).toEqual([
      { kind: 'token', token: 'a' },
      { kind: 'token', token: 'b' }
    ])
  })

  it('drops the log once a settling save folds it into main.json', async () => {
    await saveConversation(conv('id-1', ws()))
    await appendTurnEvents('id-1', ws(), [rec(1, 'a')])
    await saveConversation(conv('id-1', ws(), { appliedSeq: 1 }))
    expect((await loadConversation('id-1'))?.pendingEvents).toEqual([])
    await expect(fs.access(await logFile('id-1'))).rejects.toThrow()
  })

  // A save that lands but whose log truncation does not (crash in between)
  // must not replay the same events a second time.
  it('skips records already folded in when the log outlives its truncation', async () => {
    await saveConversation(conv('id-1', ws()))
    await appendTurnEvents('id-1', ws(), [rec(1, 'a'), rec(2, 'b')])
    // Save records the events as applied; re-append the log as if the rm failed.
    await saveConversation(conv('id-1', ws(), { appliedSeq: 2 }))
    await appendTurnEvents('id-1', ws(), [rec(1, 'a'), rec(2, 'b'), rec(3, 'c')])
    const loaded = await loadConversation('id-1')
    expect(loaded?.pendingEvents.map((r) => r.seq)).toEqual([3])
  })

  // A crash mid-append leaves a half-written final line.
  it('recovers every whole record and discards a torn final line', async () => {
    await saveConversation(conv('id-1', ws()))
    await appendTurnEvents('id-1', ws(), [rec(1, 'a'), rec(2, 'b')])
    await fs.appendFile(await logFile('id-1'), '{"seq":3,"event":{"kind":"tok', 'utf-8')
    const loaded = await loadConversation('id-1')
    expect(loaded?.pendingEvents.map((r) => r.seq)).toEqual([1, 2])
  })
})

describe('migration', () => {
  async function writeLegacyDirLayout(ws: string, id: string): Promise<void> {
    const dir = join(ws, '.projectrose', 'sessions', id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      join(dir, 'main.json'),
      JSON.stringify({ id, title: `t-${id}`, createdAt: 1, updatedAt: 2, messages: [] }),
      'utf-8'
    )
    await fs.writeFile(join(dir, 'subagent0.json'), JSON.stringify({ id, messages: [] }), 'utf-8')
  }

  async function writeLegacyFlatLayout(ws: string, id: string): Promise<void> {
    const dir = join(ws, '.projectrose', 'sessions')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      join(dir, `session-${id}.json`),
      JSON.stringify({ id, title: `flat-${id}`, createdAt: 3, updatedAt: 4, messages: [] }),
      'utf-8'
    )
  }

  it('migrates both legacy layouts and injects workspacePath', async () => {
    const ws = join(base, 'legacy-ws')
    await writeLegacyDirLayout(ws, 'dir-session')
    await writeLegacyFlatLayout(ws, 'flat-session')

    const count = await migrateWorkspaceSessions(ws)
    expect(count).toBe(2)

    const dirLoaded = await loadConversation('dir-session')
    const flatLoaded = await loadConversation('flat-session')
    expect(dirLoaded?.workspacePath).toBe(ws)
    expect(flatLoaded?.workspacePath).toBe(ws)

    // subagent file carried over
    const groups = await fs.readdir(CONV_DIR)
    const groupDir = join(CONV_DIR, groups[0])
    const wsMeta = await readWorkspaceMeta(groupDir)
    expect(wsMeta?.path).toBe(ws)
    const subFiles = await fs.readdir(join(groupDir, 'dir-session'))
    expect(subFiles).toContain('subagent0.json')
  })

  it('is idempotent and writes a marker', async () => {
    const ws = join(base, 'legacy-ws')
    await writeLegacyDirLayout(ws, 's1')

    expect(await migrateWorkspaceSessions(ws)).toBe(1)
    // Marker present → subsequent runs are no-ops.
    const marker = join(ws, '.projectrose', 'sessions', '.migrated-to-agent-home')
    expect(await fs.access(marker).then(() => true)).toBe(true)
    expect(await migrateWorkspaceSessions(ws)).toBe(0)
  })

  it('does not overwrite an already-migrated target session', async () => {
    const ws = join(base, 'legacy-ws')
    await writeLegacyDirLayout(ws, 's1')
    await migrateWorkspaceSessions(ws)

    // Mutate the migrated copy, then delete marker to force a re-scan.
    const cur = await loadConversation('s1')
    await saveConversation({ ...cur!, title: 'edited-in-agent-home' })
    await fs.rm(join(ws, '.projectrose', 'sessions', '.migrated-to-agent-home'))

    const count = await migrateWorkspaceSessions(ws)
    expect(count).toBe(0) // target exists → skipped, not clobbered
    expect((await loadConversation('s1'))?.title).toBe('edited-in-agent-home')
  })

  it('migrateAllKnownWorkspaces sweeps every recent workspace', async () => {
    const wsA = join(base, 'ws-a')
    const wsB = join(base, 'ws-b')
    await writeLegacyDirLayout(wsA, 'a1')
    await writeLegacyFlatLayout(wsB, 'b1')
    RECENTS = [
      { path: wsA, name: 'ws-a', lastOpened: 1 },
      { path: wsB, name: 'ws-b', lastOpened: 2 }
    ]

    await migrateAllKnownWorkspaces()
    expect(await loadConversation('a1')).not.toBeNull()
    expect(await loadConversation('b1')).not.toBeNull()
  })

  it('returns 0 for a workspace with no legacy sessions', async () => {
    expect(await migrateWorkspaceSessions(join(base, 'empty'))).toBe(0)
  })
})
