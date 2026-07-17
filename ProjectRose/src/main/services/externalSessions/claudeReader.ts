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
  safeParse
} from './util'

// Claude Code stores each session as
//   ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
// Each user/assistant envelope carries the REAL un-encoded `cwd`, so the
// lossy directory name is only a last-resort display fallback.

export function claudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

// Envelope types that are not part of the conversation transcript.
const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'mode',
  'queue-operation',
  'pr-link',
  'last-prompt',
  'attachment',
  'summary',
  'ai-title',
  'custom-title',
  'system'
])

const TITLE_TYPES = new Set(['ai-title', 'custom-title'])

interface ListCacheEntry {
  mtimeMs: number
  meta: ExternalSessionMeta
}
const listCache = new Map<string, ListCacheEntry>()

function extractTitle(o: Record<string, unknown>): string | null {
  const t = o.type
  if (t === 'ai-title' && typeof o.aiTitle === 'string') return o.aiTitle
  if (t === 'custom-title' && typeof o.customTitle === 'string') return o.customTitle
  if (t === 'summary' && typeof o.summary === 'string') return o.summary
  return null
}

function envelopeCwd(o: Record<string, unknown>): string | null {
  return typeof o.cwd === 'string' && o.cwd ? o.cwd : null
}

function firstUserText(o: Record<string, unknown>): string | null {
  if (o.type !== 'user' || o.isMeta === true || o.isSidechain === true) return null
  const msg = o.message as { content?: unknown } | undefined
  return firstStringContent(msg?.content)
}

async function buildMeta(filePath: string, id: string, mtimeMs: number, birthMs: number): Promise<ExternalSessionMeta> {
  const { head, tail } = await readHeadTailLines(filePath)
  let cwd: string | null = null
  let firstUser: string | null = null
  // Head: earliest cwd + first real user message + an early title if any.
  let title: string | null = null
  for (const line of head) {
    const o = safeParse(line) as Record<string, unknown> | null
    if (!o) continue
    if (!cwd) cwd = envelopeCwd(o)
    if (!firstUser) firstUser = firstUserText(o)
    const t = extractTitle(o)
    if (t) title = t
  }
  // Tail: the LAST title wins (Claude rewrites ai-title as the session grows).
  for (const line of tail) {
    const o = safeParse(line) as Record<string, unknown> | null
    if (!o) continue
    if (TITLE_TYPES.has(String(o.type))) {
      const t = extractTitle(o)
      if (t) title = t
    }
    if (!cwd) cwd = envelopeCwd(o)
  }

  const approximate = !cwd
  const workspacePath = cwd ?? deriveApproxPath(filePath)
  const finalTitle = title || truncate(firstUser) || id

  return {
    source: 'claude-code',
    id,
    title: finalTitle,
    workspacePath,
    approximatePath: approximate || undefined,
    createdAt: birthMs,
    updatedAt: mtimeMs,
    filePath
  }
}

function deriveApproxPath(filePath: string): string {
  // The encoded dir name is lossy; surface it verbatim as a display hint.
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 2] ?? 'unknown'
}

function truncate(s: string | null, n = 80): string | null {
  if (!s) return null
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine
}

export async function listClaudeSessions(baseDir = claudeProjectsDir()): Promise<ExternalSessionMeta[]> {
  let groups: string[]
  try {
    groups = await fs.readdir(baseDir)
  } catch {
    return [] // no Claude Code install
  }

  const metas: ExternalSessionMeta[] = []
  for (const group of groups) {
    const groupDir = join(baseDir, group)
    let files: string[]
    try {
      files = await fs.readdir(groupDir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue // skip sibling <sessionId>/ dirs
      const filePath = join(groupDir, file)
      const id = file.slice(0, -'.jsonl'.length)
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
        const meta = await buildMeta(filePath, id, stat.mtimeMs, stat.birthtimeMs || stat.ctimeMs)
        listCache.set(filePath, { mtimeMs: stat.mtimeMs, meta })
        metas.push(meta)
      } catch {
        // skip unreadable session
      }
    }
  }
  return metas
}

export async function readClaudeTranscript(filePath: string): Promise<ExternalTranscript> {
  const objs = await readJsonlObjects(filePath)
  const entries: ExternalTranscriptEntry[] = []
  const toolNames = new Map<string, string>() // tool_use id → name
  let title = ''
  let workspacePath = ''
  let truncated = false

  for (const o of objs) {
    const type = String(o.type)
    if (typeof o.cwd === 'string' && o.cwd && !workspacePath) workspacePath = o.cwd
    const t = extractTitle(o)
    if (t) title = t
    if (SKIP_TYPES.has(type)) continue
    if (o.isMeta === true || o.isSidechain === true) continue
    if (entries.length >= MAX_TRANSCRIPT_ENTRIES) {
      truncated = true
      break
    }

    const timestamp = typeof o.timestamp === 'string' ? o.timestamp : undefined
    const msg = o.message as { role?: string; model?: string; content?: unknown } | undefined
    if (!msg) continue

    if (type === 'assistant') {
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const block of content) {
        const b = block as Record<string, unknown>
        const bt = b.type
        if (bt === 'text' && typeof b.text === 'string') {
          entries.push({ kind: 'assistant_message', content: b.text, timestamp, model: msg.model })
        } else if (bt === 'thinking' && typeof b.thinking === 'string') {
          entries.push({ kind: 'assistant_thought', content: b.thinking, timestamp })
        } else if (bt === 'tool_use' && typeof b.id === 'string') {
          const name = typeof b.name === 'string' ? b.name : 'tool'
          toolNames.set(b.id, name)
          entries.push({ kind: 'tool_call', toolName: name, toolCallId: b.id, input: b.input, timestamp })
        }
      }
    } else if (type === 'user') {
      const content = msg.content
      if (typeof content === 'string') {
        entries.push({ kind: 'user_message', content, timestamp })
      } else if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>
          if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
            entries.push({
              kind: 'tool_result',
              toolName: toolNames.get(b.tool_use_id) ?? 'tool',
              toolCallId: b.tool_use_id,
              output: normalizeToolResultContent(b.content),
              isError: b.is_error === true || undefined,
              timestamp
            })
          } else if (b.type === 'text' && typeof b.text === 'string') {
            entries.push({ kind: 'user_message', content: b.text, timestamp })
          }
        }
      }
    }
  }

  const id = fileIdFromPath(filePath)
  return {
    source: 'claude-code',
    id,
    title: title || id,
    workspacePath: workspacePath || deriveApproxPath(filePath),
    entries,
    entryCountTruncated: truncated || undefined
  }
}

function fileIdFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return base.endsWith('.jsonl') ? base.slice(0, -'.jsonl'.length) : base
}
