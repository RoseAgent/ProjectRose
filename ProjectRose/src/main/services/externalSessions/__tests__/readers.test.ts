import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { listClaudeSessions, readClaudeTranscript } from '../claudeReader'
import { listCodexSessions, readCodexTranscript } from '../codexReader'

let base: string

beforeEach(async () => {
  base = await fs.mkdtemp(join(tmpdir(), 'ext-sess-'))
})
afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

function jsonl(lines: unknown[]): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

describe('claudeReader', () => {
  async function writeClaude(group: string, id: string, lines: unknown[]): Promise<string> {
    const dir = join(base, group)
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, `${id}.jsonl`)
    await fs.writeFile(file, jsonl(lines), 'utf-8')
    return file
  }

  const CWD = 'C:\\Users\\Andrew\\Desktop\\ProjectRose'

  it('returns empty when the store is absent', async () => {
    expect(await listClaudeSessions(join(base, 'nope'))).toEqual([])
  })

  it('lists sessions with real cwd and latest ai-title', async () => {
    await writeClaude('C--Users-Andrew-Desktop-ProjectRose', 'sess-1', [
      { type: 'user', cwd: CWD, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'first question' } },
      { type: 'ai-title', aiTitle: 'Early title', sessionId: 'sess-1' },
      { type: 'assistant', message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'hi' }] } },
      { type: 'ai-title', aiTitle: 'Final title wins', sessionId: 'sess-1' }
    ])
    const metas = await listClaudeSessions(base)
    expect(metas).toHaveLength(1)
    expect(metas[0].source).toBe('claude-code')
    expect(metas[0].workspacePath).toBe(CWD)
    expect(metas[0].title).toBe('Final title wins')
    expect(metas[0].approximatePath).toBeUndefined()
  })

  it('falls back to first user message, then flags approximate path without cwd', async () => {
    await writeClaude('Some-Encoded-Dir', 'sess-2', [
      { type: 'user', message: { role: 'user', content: 'no cwd here just text' } }
    ])
    const metas = await listClaudeSessions(base)
    expect(metas[0].title).toBe('no cwd here just text')
    expect(metas[0].approximatePath).toBe(true)
    expect(metas[0].workspacePath).toBe('Some-Encoded-Dir')
  })

  it('parses a full transcript: thinking, text, tool_use → tool_result', async () => {
    const file = await writeClaude('g', 'sess-3', [
      { type: 'user', cwd: CWD, message: { role: 'user', content: 'do a thing' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-fable-5',
          content: [
            { type: 'thinking', thinking: 'let me think', signature: 'x' },
            { type: 'text', text: 'working on it' },
            { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.ts' } }
          ]
        }
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'file body' }], is_error: false }]
        }
      },
      { type: 'file-history-snapshot', foo: 1 },
      { type: 'attachment', foo: 2 }
    ])
    const t = await readClaudeTranscript(file)
    expect(t.workspacePath).toBe(CWD)
    const kinds = t.entries.map((e) => e.kind)
    expect(kinds).toEqual(['user_message', 'assistant_thought', 'assistant_message', 'tool_call', 'tool_result'])
    const toolResult = t.entries.find((e) => e.kind === 'tool_result') as { toolName: string; output: string }
    expect(toolResult.toolName).toBe('read_file') // resolved via tool_use id map
    expect(toolResult.output).toBe('file body')
  })

  it('skips isMeta and isSidechain entries and tolerates corrupt lines', async () => {
    const dir = join(base, 'g')
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, 'sess-4.jsonl')
    await fs.writeFile(
      file,
      jsonl([
        { type: 'user', cwd: CWD, isMeta: true, message: { role: 'user', content: 'meta noise' } },
        { type: 'user', cwd: CWD, isSidechain: true, message: { role: 'user', content: 'sidechain' } },
        { type: 'user', cwd: CWD, message: { role: 'user', content: 'real message' } }
      ]) + '{ this is not json }\n',
      'utf-8'
    )
    const t = await readClaudeTranscript(file)
    expect(t.entries).toHaveLength(1)
    expect((t.entries[0] as { content: string }).content).toBe('real message')
  })
})

describe('codexReader', () => {
  async function writeCodex(id: string, lines: unknown[]): Promise<string> {
    const dir = join(base, '2026', '01', '15')
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, `rollout-2026-01-15T10-00-00-${id}.jsonl`)
    await fs.writeFile(file, jsonl(lines), 'utf-8')
    return file
  }

  const UUID = '11111111-2222-3333-4444-555555555555'
  const CWD = '/home/andrew/proj'

  it('returns empty when the store is absent', async () => {
    expect(await listCodexSessions(join(base, 'nope'))).toEqual([])
  })

  it('lists a session using session_meta cwd + first user message', async () => {
    await writeCodex(UUID, [
      { timestamp: '2026-01-15T10:00:00Z', type: 'session_meta', payload: { id: UUID, cwd: CWD, timestamp: '2026-01-15T10:00:00Z' } },
      { timestamp: '2026-01-15T10:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello codex' }] } }
    ])
    const metas = await listCodexSessions(base)
    expect(metas).toHaveLength(1)
    expect(metas[0].source).toBe('codex')
    expect(metas[0].id).toBe(UUID)
    expect(metas[0].workspacePath).toBe(CWD)
    expect(metas[0].title).toBe('hello codex')
  })

  it('parses message/reasoning/function_call/output into transcript entries', async () => {
    const file = await writeCodex(UUID, [
      { type: 'session_meta', payload: { id: UUID, cwd: CWD } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'run ls' }] } },
      { type: 'response_item', payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'thinking about ls' }] } },
      { type: 'response_item', payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: '{"cmd":"ls"}' } },
      { type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: 'a.txt b.txt' } },
      { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] } },
      { type: 'event_msg', payload: { type: 'noise' } },
      { type: 'turn_context', payload: {} }
    ])
    const t = await readCodexTranscript(file)
    expect(t.workspacePath).toBe(CWD)
    const kinds = t.entries.map((e) => e.kind)
    expect(kinds).toEqual(['user_message', 'assistant_thought', 'tool_call', 'tool_result', 'assistant_message'])
    const call = t.entries.find((e) => e.kind === 'tool_call') as { input: unknown }
    expect(call.input).toEqual({ cmd: 'ls' }) // JSON-string arguments parsed
  })
})
