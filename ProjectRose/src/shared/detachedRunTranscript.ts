// Transcript shape returned by the `detachedRunWithTools` contract capability
// (ADR 0014). Originally introduced for rose-routines; renamed here from
// "Routine" to "DetachedRun" once rose-channels became the second consumer
// (ADR 0015). The transcript itself is consumer-agnostic — the per-fire
// wrapper records (RoutineRunRecord, ChannelRuleRunRecord) compose it with
// their own header metadata.
//
// Pure functions only, no IO — safe to import from main or renderer.

export type DetachedRunTranscriptEntry =
  | { kind: 'user_message'; content: string }
  | { kind: 'assistant_thought'; content: string }
  | { kind: 'assistant_message'; content: string }
  | { kind: 'tool_call'; toolName: string; toolCallId: string; input: unknown }
  | { kind: 'tool_result'; toolName: string; toolCallId: string; output: string }

export interface DetachedRunTranscript {
  entries: DetachedRunTranscriptEntry[]
  finalText: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  modelDisplay: string
}

// ── Shared text helpers (used by consumer-specific run-record builders) ──

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Format a Date as a filename-safe local timestamp: 2026-05-24T09-00-00 */
export function timestampForFilename(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`
  )
}

/** Format a Date as an ISO-like local datetime: 2026-05-24T09:00:00 */
export function isoLocal(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

export function summariseInput(input: unknown): string {
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

export function indentBlock(text: string, indent = '  '): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `${indent}${line}` : ''))
    .join('\n')
}

function dedentBlock(lines: string[]): string {
  return lines.map((l) => l.replace(/^ {2}/, '')).join('\n').trim()
}

// ── Transcript markdown block ──────────────────────────────────────────
// The "## Transcript" + "## Final Response" portion of a run file. Consumer
// builders (buildRunMarkdown for routines, buildChannelRuleRunMarkdown for
// channels) call this for the body and prepend their own header bullets +
// "## Prompt" section.

export function buildTranscriptMarkdownBlock(transcript: DetachedRunTranscript): string {
  const lines: string[] = []
  lines.push('## Transcript')
  for (const e of transcript.entries) {
    switch (e.kind) {
      case 'user_message':
        lines.push(`- user:\n${indentBlock(e.content)}`)
        break
      case 'assistant_thought':
        lines.push(`- assistant (thought):\n${indentBlock(e.content)}`)
        break
      case 'assistant_message':
        lines.push(`- assistant:\n${indentBlock(e.content)}`)
        break
      case 'tool_call':
        lines.push(
          `- tool_call: ${e.toolName} [${e.toolCallId}]\n${indentBlock(summariseInput(e.input))}`
        )
        break
      case 'tool_result':
        lines.push(
          `- tool_result: ${e.toolName} [${e.toolCallId}]\n${indentBlock(e.output)}`
        )
        break
    }
  }
  lines.push('', '## Final Response', transcript.finalText.trim() || '(no final response)')
  return lines.join('\n')
}

const TRANSCRIPT_BULLET_RE = /^\s*-\s+(user|assistant \(thought\)|assistant|tool_call|tool_result):\s*(.*?)\s*$/

/** Parse the "## Transcript" section lines back into entries. */
export function parseTranscriptMarkdownBlock(lines: string[]): DetachedRunTranscriptEntry[] {
  const out: DetachedRunTranscriptEntry[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(TRANSCRIPT_BULLET_RE)
    if (!m) {
      i += 1
      continue
    }
    const tag = m[1]
    const trailing = m[2]
    // Collect the indented continuation lines (start with 2 spaces, or blanks)
    const body: string[] = []
    if (trailing && tag !== 'tool_call' && tag !== 'tool_result') {
      body.push(trailing)
    }
    let j = i + 1
    while (j < lines.length && (lines[j].startsWith('  ') || lines[j] === '')) {
      body.push(lines[j])
      j += 1
    }
    const bodyText = dedentBlock(body)
    if (tag === 'user') {
      out.push({ kind: 'user_message', content: bodyText })
    } else if (tag === 'assistant (thought)') {
      out.push({ kind: 'assistant_thought', content: bodyText })
    } else if (tag === 'assistant') {
      out.push({ kind: 'assistant_message', content: bodyText })
    } else if (tag === 'tool_call') {
      const meta = trailing.match(/^(\S+)\s+\[([^\]]+)\]\s*$/)
      const toolName = meta?.[1] ?? trailing.trim() ?? 'unknown'
      const toolCallId = meta?.[2] ?? ''
      let input: unknown = bodyText
      try {
        input = JSON.parse(bodyText)
      } catch {
        /* leave as raw string */
      }
      out.push({ kind: 'tool_call', toolName, toolCallId, input })
    } else if (tag === 'tool_result') {
      const meta = trailing.match(/^(\S+)\s+\[([^\]]+)\]\s*$/)
      const toolName = meta?.[1] ?? trailing.trim() ?? 'unknown'
      const toolCallId = meta?.[2] ?? ''
      out.push({ kind: 'tool_result', toolName, toolCallId, output: bodyText })
    }
    i = j
  }
  return out
}

/** Empty transcript shell — useful for "failed" run records. */
export function emptyTranscript(modelDisplay = 'unknown'): DetachedRunTranscript {
  return {
    entries: [],
    finalText: '',
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    modelDisplay
  }
}
