import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  MAX_TRANSCRIPT_ENTRIES,
  type ExternalSessionMeta,
  type ExternalTranscript,
  type ExternalTranscriptEntry
} from '../../../shared/externalSession'
import {
  firstStringContent,
  normalizeToolResultContent,
  readHeadTailLines,
  readJsonlObjects,
  safeParse,
  safeStringify
} from './util'

// Codex stores each session as
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
// Line envelope: { timestamp, type, payload }. The first line is a
// `session_meta` whose payload carries the real `cwd`. `response_item`
// payloads hold the actual messages/tool calls (OpenAI Responses item shapes).

export function codexSessionsDir(): string {
  return join(homedir(), '.codex', 'sessions')
}

interface ListCacheEntry {
  mtimeMs: number
  meta: ExternalSessionMeta
}
const listCache = new Map<string, ListCacheEntry>()

// Recursively collect rollout-*.jsonl under a YYYY/MM/DD tree (depth-bounded).
async function collectRolloutFiles(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > 4) return
  let entries: Array<{ name: string; isDir: boolean }>
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    entries = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }))
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDir) {
      await collectRolloutFiles(full, depth + 1, out)
    } else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
      out.push(full)
    }
  }
}

function payloadOf(o: Record<string, unknown>): Record<string, unknown> | null {
  const p = o.payload
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : null
}

async function buildMeta(filePath: string, mtimeMs: number): Promise<ExternalSessionMeta | null> {
  const { head } = await readHeadTailLines(filePath, 64 * 1024)
  let id = ''
  let cwd: string | null = null
  let createdAt = mtimeMs
  let firstUser: string | null = null

  for (const line of head) {
    const o = safeParse(line) as Record<string, unknown> | null
    if (!o) continue
    const type = String(o.type)
    const payload = payloadOf(o)
    if (type === 'session_meta' && payload) {
      if (typeof payload.id === 'string') id = payload.id
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.timestamp === 'string') {
        const ms = Date.parse(payload.timestamp)
        if (!Number.isNaN(ms)) createdAt = ms
      }
    } else if (type === 'response_item' && payload && !firstUser) {
      if (payload.type === 'message' && payload.role === 'user') {
        firstUser = firstStringContent(payload.content)
      }
    }
  }

  if (!id) id = fileIdFromPath(filePath)
  const approximate = !cwd
  return {
    source: 'codex',
    id,
    title: truncate(firstUser) || id,
    workspacePath: cwd ?? 'unknown',
    approximatePath: approximate || undefined,
    createdAt,
    updatedAt: mtimeMs,
    filePath
  }
}

function truncate(s: string | null, n = 80): string | null {
  if (!s) return null
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine
}

function fileIdFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  const m = /rollout-.*-([0-9a-fA-F-]{36})\.jsonl$/.exec(base)
  return m ? m[1] : base.replace(/\.jsonl$/, '')
}

export async function listCodexSessions(baseDir = codexSessionsDir()): Promise<ExternalSessionMeta[]> {
  const files: string[] = []
  await collectRolloutFiles(baseDir, 0, files)
  const metas: ExternalSessionMeta[] = []
  for (const filePath of files) {
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(filePath)
    } catch {
      continue
    }
    const cached = listCache.get(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      metas.push(cached.meta)
      continue
    }
    try {
      const meta = await buildMeta(filePath, stat.mtimeMs)
      if (meta) {
        listCache.set(filePath, { mtimeMs: stat.mtimeMs, meta })
        metas.push(meta)
      }
    } catch {
      // skip unreadable session
    }
  }
  return metas
}

export async function readCodexTranscript(filePath: string): Promise<ExternalTranscript> {
  const objs = await readJsonlObjects(filePath)
  const entries: ExternalTranscriptEntry[] = []
  let id = ''
  let workspacePath = ''
  let firstUser: string | null = null
  let truncated = false

  for (const o of objs) {
    const type = String(o.type)
    const payload = payloadOf(o)
    const timestamp = typeof o.timestamp === 'string' ? o.timestamp : undefined
    if (type === 'session_meta' && payload) {
      if (typeof payload.id === 'string') id = payload.id
      if (typeof payload.cwd === 'string') workspacePath = payload.cwd
      continue
    }
    if (type !== 'response_item' || !payload) continue // skip event_msg/turn_context/compacted
    if (entries.length >= MAX_TRANSCRIPT_ENTRIES) {
      truncated = true
      break
    }

    const ptype = String(payload.type)
    if (ptype === 'message') {
      const text = firstStringContent(payload.content) ?? ''
      if (payload.role === 'user') {
        if (!firstUser) firstUser = text
        entries.push({ kind: 'user_message', content: text, timestamp })
      } else {
        entries.push({ kind: 'assistant_message', content: text, timestamp })
      }
    } else if (ptype === 'reasoning') {
      const summary = Array.isArray(payload.summary)
        ? payload.summary
            .map((s) => (s && typeof s === 'object' ? (s as { text?: string }).text ?? '' : String(s)))
            .join('\n')
        : firstStringContent(payload.summary) ?? ''
      if (summary) entries.push({ kind: 'assistant_thought', content: summary, timestamp })
    } else if (ptype === 'function_call' || ptype === 'local_shell_call') {
      const callId = typeof payload.call_id === 'string' ? payload.call_id : String(payload.id ?? '')
      const name = typeof payload.name === 'string' ? payload.name : ptype
      let input: unknown = payload.arguments ?? payload.action ?? payload
      if (typeof input === 'string') {
        try {
          input = JSON.parse(input)
        } catch {
          /* leave as string */
        }
      }
      entries.push({ kind: 'tool_call', toolName: name, toolCallId: callId, input, timestamp })
    } else if (ptype === 'function_call_output' || ptype === 'local_shell_call_output') {
      const callId = typeof payload.call_id === 'string' ? payload.call_id : ''
      const out = payload.output
      entries.push({
        kind: 'tool_result',
        toolName: 'tool',
        toolCallId: callId,
        output: typeof out === 'string' ? out : normalizeToolResultContent(out) || safeStringify(out),
        timestamp
      })
    }
  }

  if (!id) id = fileIdFromPath(filePath)
  return {
    source: 'codex',
    id,
    title: truncate(firstUser) || id,
    workspacePath: workspacePath || 'unknown',
    entries,
    entryCountTruncated: truncated || undefined
  }
}
