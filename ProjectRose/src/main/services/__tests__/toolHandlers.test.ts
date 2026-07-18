import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

import {
  handleReadFile,
  handleWriteFile,
  handleEditFile,
  handleDeleteFile,
  handleMoveFile,
  handleRunCommand,
  handleGrep,
  handleGlob
} from '../toolHandlers'
import { clearConversationToolState } from '../conversationToolState'
import type { ExtensionToolCtx } from '../../../shared/extension-types'

let root: string
let ctx: ExtensionToolCtx

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rose-tools-'))
  ctx = { sessionId: `test-${randomUUID()}`, turnId: undefined }
})

afterEach(async () => {
  clearConversationToolState(ctx.sessionId)
  await rm(root, { recursive: true, force: true })
})

describe('handleReadFile', () => {
  it('returns line-numbered content', async () => {
    await writeFile(join(root, 'a.txt'), 'alpha\nbeta\ngamma', 'utf-8')
    const out = await handleReadFile({ path: 'a.txt' }, root, ctx)
    expect(out).toBe('1\talpha\n2\tbeta\n3\tgamma')
  })

  it('pages with offset/limit and reports the window', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n')
    await writeFile(join(root, 'a.txt'), lines, 'utf-8')
    const out = await handleReadFile({ path: 'a.txt', offset: 4, limit: 2 }, root, ctx)
    expect(out).toContain('4\tline4')
    expect(out).toContain('5\tline5')
    expect(out).not.toContain('6\tline6')
    expect(out).toContain('[Showing lines 4–5 of 10.')
  })

  it('caps unpaged reads at 2000 lines with a footer', async () => {
    const lines = Array.from({ length: 2100 }, (_, i) => `l${i}`).join('\n')
    await writeFile(join(root, 'big.txt'), lines, 'utf-8')
    const out = await handleReadFile({ path: 'big.txt' }, root, ctx)
    expect(out).toContain('2000\tl1999')
    expect(out).not.toContain('2001\tl2000')
    expect(out).toContain('[Showing lines 1–2000 of 2100.')
  })

  it('errors clearly on a missing file', async () => {
    const out = await handleReadFile({ path: 'nope.txt' }, root, ctx)
    expect(out).toBe('Error: file does not exist: nope.txt')
  })

  it('reports empty files distinctly', async () => {
    await writeFile(join(root, 'empty.txt'), '', 'utf-8')
    expect(await handleReadFile({ path: 'empty.txt' }, root, ctx)).toBe('[File is empty]')
  })

  it('refuses binary content', async () => {
    await writeFile(join(root, 'bin.dat'), Buffer.from([0x89, 0x50, 0x00, 0x47]))
    const out = await handleReadFile({ path: 'bin.dat' }, root, ctx)
    expect(out).toContain('binary')
  })
})

describe('write/edit read-before-modify guard', () => {
  it('write_file creates new files without a prior read', async () => {
    const out = await handleWriteFile({ path: 'new.txt', content: 'hi' }, root, ctx)
    expect(out).toBe('File written: new.txt')
    expect(await readFile(join(root, 'new.txt'), 'utf-8')).toBe('hi')
  })

  it('write_file refuses to overwrite an unread existing file', async () => {
    await writeFile(join(root, 'a.txt'), 'original', 'utf-8')
    const out = await handleWriteFile({ path: 'a.txt', content: 'clobber' }, root, ctx)
    expect(out).toContain('has not been read this conversation')
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('original')
  })

  it('write_file overwrites after a read', async () => {
    await writeFile(join(root, 'a.txt'), 'original', 'utf-8')
    await handleReadFile({ path: 'a.txt' }, root, ctx)
    const out = await handleWriteFile({ path: 'a.txt', content: 'updated' }, root, ctx)
    expect(out).toBe('File written: a.txt')
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('updated')
  })

  it('edit_file refuses an unread file', async () => {
    await writeFile(join(root, 'a.txt'), 'one two', 'utf-8')
    const out = await handleEditFile({ path: 'a.txt', old_string: 'one', new_string: 'ONE' }, root, ctx)
    expect(out).toContain('has not been read this conversation')
  })
})

describe('handleEditFile', () => {
  beforeEach(async () => {
    await writeFile(join(root, 'a.txt'), 'foo bar foo baz', 'utf-8')
    await handleReadFile({ path: 'a.txt' }, root, ctx)
  })

  it('replaces a unique match', async () => {
    const out = await handleEditFile({ path: 'a.txt', old_string: 'baz', new_string: 'qux' }, root, ctx)
    expect(out).toBe('File edited: a.txt')
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('foo bar foo qux')
  })

  it('rejects ambiguous matches and suggests replace_all', async () => {
    const out = await handleEditFile({ path: 'a.txt', old_string: 'foo', new_string: 'X' }, root, ctx)
    expect(out).toContain('matches 2 locations')
    expect(out).toContain('replace_all')
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('foo bar foo baz')
  })

  it('replace_all replaces every occurrence and reports the count', async () => {
    const out = await handleEditFile(
      { path: 'a.txt', old_string: 'foo', new_string: 'X', replace_all: true },
      root,
      ctx
    )
    expect(out).toBe('File edited: a.txt (2 replacements)')
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('X bar X baz')
  })
})

describe('delete_file / move_file', () => {
  it('deletes a file and refuses directories', async () => {
    await writeFile(join(root, 'a.txt'), 'x', 'utf-8')
    expect(await handleDeleteFile({ path: 'a.txt' }, root, ctx)).toBe('File deleted: a.txt')
    expect(await handleDeleteFile({ path: '.' }, root, ctx)).toContain('is a directory')
  })

  it('moves a file, creating destination directories', async () => {
    await writeFile(join(root, 'a.txt'), 'content', 'utf-8')
    const out = await handleMoveFile({ path: 'a.txt', new_path: 'sub/dir/b.txt' }, root, ctx)
    expect(out).toContain('Moved')
    expect(await readFile(join(root, 'sub', 'dir', 'b.txt'), 'utf-8')).toBe('content')
    await expect(stat(join(root, 'a.txt'))).rejects.toThrow()
  })

  it('refuses to move onto an existing destination', async () => {
    await writeFile(join(root, 'a.txt'), 'x', 'utf-8')
    await writeFile(join(root, 'b.txt'), 'y', 'utf-8')
    const out = await handleMoveFile({ path: 'a.txt', new_path: 'b.txt' }, root, ctx)
    expect(out).toContain('destination already exists')
  })
})

describe('handleRunCommand', () => {
  it('runs a command asynchronously and returns its output', async () => {
    const out = await handleRunCommand({ command: 'echo hello-rose' }, root, ctx)
    expect(out).toContain('hello-rose')
  })

  it('reports failures with the exit code', async () => {
    const out = await handleRunCommand({ command: 'exit 3' }, root, ctx)
    expect(out).toContain('Command failed (exit 3)')
  })

  it('kills the command at the configured timeout', async () => {
    const sleep = process.platform === 'win32' ? 'Start-Sleep -Seconds 10' : 'sleep 10'
    const started = Date.now()
    const out = await handleRunCommand({ command: sleep, timeout: 1500 }, root, ctx)
    expect(Date.now() - started).toBeLessThan(9000)
    expect(out).toContain('timed out')
  }, 15_000)
})

describe('ripgrep-backed search', () => {
  beforeEach(async () => {
    await writeFile(join(root, 'one.ts'), 'const needle = 1\nconst hay = 2', 'utf-8')
    await writeFile(join(root, 'two.md'), 'needle in markdown', 'utf-8')
  })

  it('grep finds matches across files as path:line:text', async () => {
    const out = await handleGrep({ pattern: 'needle' }, root)
    expect(out).toContain('one.ts')
    expect(out).toContain('two.md')
  })

  it('grep narrows by include extensions', async () => {
    const out = await handleGrep({ pattern: 'needle', include: '.ts' }, root)
    expect(out).toContain('one.ts')
    expect(out).not.toContain('two.md')
  })

  it('grep reports no matches', async () => {
    expect(await handleGrep({ pattern: 'zzz-not-here' }, root)).toBe('No matches for: zzz-not-here')
  })

  it('grep never returns .env content', async () => {
    await writeFile(join(root, '.env'), 'SECRET=needle', 'utf-8')
    const out = await handleGrep({ pattern: 'SECRET' }, root)
    expect(out).toBe('No matches for: SECRET')
  })

  it('glob lists matching files', async () => {
    const out = await handleGlob({ pattern: '*.ts' }, root)
    expect(out).toContain('one.ts')
    expect(out).not.toContain('two.md')
  })

  it('glob reports no matches', async () => {
    expect(await handleGlob({ pattern: '*.rs' }, root)).toBe('No files match: *.rs')
  })
})
