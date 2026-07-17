import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  encodeWorkspacePath,
  sameWorkspacePath,
  resolveGroupDir,
  ensureGroupDir,
  readWorkspaceMeta,
  WORKSPACE_META_FILE
} from '../workspaceEncoding'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ws-enc-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('encodeWorkspacePath', () => {
  it('replaces every non-alphanumeric character with a dash (Claude scheme)', () => {
    expect(encodeWorkspacePath('C:\\Users\\Andrew\\Desktop\\ProjectRose')).toBe(
      'C--Users-Andrew-Desktop-ProjectRose'
    )
    expect(encodeWorkspacePath('/home/andrew/code')).toBe('-home-andrew-code')
  })

  it('is trailing-separator insensitive', () => {
    expect(encodeWorkspacePath('/a/b/')).toBe(encodeWorkspacePath('/a/b'))
    expect(encodeWorkspacePath('C:\\a\\b\\')).toBe(encodeWorkspacePath('C:\\a\\b'))
  })
})

describe('sameWorkspacePath', () => {
  it('ignores trailing separators', () => {
    expect(sameWorkspacePath('/a/b', '/a/b/')).toBe(true)
  })

  it('is case-insensitive on win32 only', () => {
    if (process.platform === 'win32') {
      expect(sameWorkspacePath('C:\\Foo', 'c:\\foo')).toBe(true)
    } else {
      expect(sameWorkspacePath('/Foo', '/foo')).toBe(false)
    }
  })
})

describe('ensureGroupDir / resolveGroupDir', () => {
  it('creates the encoded dir and records the real path in workspace.json', async () => {
    const real = join(root, 'a', 'b')
    const dir = await ensureGroupDir(root, real)
    const meta = await readWorkspaceMeta(dir)
    expect(meta?.path).toBe(real)
    expect(await fs.readdir(root)).toContain(encodeWorkspacePath(real))
  })

  it('reuses the same group dir for the same real path', async () => {
    const real = join(root, 'proj')
    const a = await ensureGroupDir(root, real)
    const b = await ensureGroupDir(root, real)
    expect(a).toBe(b)
    expect(await fs.readdir(root)).toHaveLength(1)
  })

  it('reuses a group even when the encoded name differs (win32 casing)', async () => {
    if (process.platform !== 'win32') return
    const first = await ensureGroupDir(root, 'C:\\Users\\Andrew\\Proj')
    const second = await resolveGroupDir(root, 'c:\\users\\andrew\\proj')
    expect(second).toBe(first)
  })

  it('hash-suffixes on encoding collision with a different real path', async () => {
    // Two distinct paths that collide under the lossy dash encoding.
    const p1 = '/a/b'
    const p2 = '/a-b'
    expect(encodeWorkspacePath(p1)).toBe(encodeWorkspacePath(p2))

    const d1 = await ensureGroupDir(root, p1)
    const d2 = await ensureGroupDir(root, p2)
    expect(d1).not.toBe(d2)

    const m1 = await readWorkspaceMeta(d1)
    const m2 = await readWorkspaceMeta(d2)
    expect(m1?.path).toBe(p1)
    expect(m2?.path).toBe(p2)
  })

  it('does not overwrite an existing workspace.json', async () => {
    const real = join(root, 'proj')
    const dir = await ensureGroupDir(root, real)
    const created = (await readWorkspaceMeta(dir))!.createdAt
    await new Promise((r) => setTimeout(r, 5))
    await ensureGroupDir(root, real)
    expect((await readWorkspaceMeta(dir))!.createdAt).toBe(created)
  })

  it('ignores directories without a workspace.json when resolving by path', async () => {
    await fs.mkdir(join(root, 'stray-dir'), { recursive: true })
    const real = join(root, 'proj')
    const dir = await ensureGroupDir(root, real)
    expect(dir).toBe(join(root, encodeWorkspacePath(real)))
    expect(WORKSPACE_META_FILE).toBe('workspace.json')
  })
})
