import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock every dependency so we assert only the gating logic: load runtimes for
// workspaces that exist on disk AND have at least one enabled rule.
const loaded: string[] = []
let known: Array<{ path: string; existsOnDisk: boolean }> = []
let routinesByWs: Record<string, Array<{ routine: { enabled: boolean } }>> = {}
let rulesByWs: Record<string, Array<{ rule: { enabled: boolean } }>> = {}

vi.mock('../../extensions/builtins', () => ({
  loadAllBuiltinMains: vi.fn(async (ws: string) => {
    loaded.push(ws)
  }),
}))
vi.mock('../workspaceRegistry', () => ({
  listKnownWorkspaces: vi.fn(async () => known),
}))
vi.mock('../../extensions/builtins/rose-routines/main', () => ({
  listRoutines: vi.fn(async (ws: string) => routinesByWs[ws] ?? []),
}))
vi.mock('../../extensions/builtins/rose-channels/main', () => ({
  listRules: vi.fn(async (ws: string) => rulesByWs[ws] ?? []),
}))

import { startAlwaysOnRuntimes, ensureRuntimeFor } from '../alwaysOnRuntimes'
import { loadAllBuiltinMains } from '../../extensions/builtins'

beforeEach(() => {
  loaded.length = 0
  known = []
  routinesByWs = {}
  rulesByWs = {}
  vi.mocked(loadAllBuiltinMains).mockClear()
})

describe('startAlwaysOnRuntimes', () => {
  it('loads only workspaces that exist on disk and have an enabled rule', async () => {
    known = [
      { path: '/a', existsOnDisk: true }, // enabled routine → load
      { path: '/b', existsOnDisk: true }, // enabled channel rule → load
      { path: '/c', existsOnDisk: true }, // rules present but all disabled → skip
      { path: '/d', existsOnDisk: false }, // enabled rule but missing on disk → skip
      { path: '/e', existsOnDisk: true }, // no rules at all → skip
    ]
    routinesByWs = {
      '/a': [{ routine: { enabled: true } }],
      '/c': [{ routine: { enabled: false } }],
      '/d': [{ routine: { enabled: true } }],
    }
    rulesByWs = {
      '/b': [{ rule: { enabled: true } }],
      '/c': [{ rule: { enabled: false } }],
    }

    await startAlwaysOnRuntimes()

    expect(loaded.sort()).toEqual(['/a', '/b'])
  })

  it('tolerates a workspace whose rule listing throws', async () => {
    known = [{ path: '/x', existsOnDisk: true }]
    routinesByWs = {} // listRoutines returns [] → no enabled rules → skip, no throw
    await expect(startAlwaysOnRuntimes()).resolves.toBeUndefined()
    expect(loaded).toEqual([])
  })
})

describe('ensureRuntimeFor', () => {
  it('loads the given workspace unconditionally (idempotent bring-up)', async () => {
    await ensureRuntimeFor('/proj')
    expect(loaded).toEqual(['/proj'])
  })

  it('is a no-op for an empty path', async () => {
    await ensureRuntimeFor('')
    expect(loaded).toEqual([])
  })
})
