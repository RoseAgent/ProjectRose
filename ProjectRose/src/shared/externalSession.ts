// External Sessions are read-only transcripts discovered in another agent
// CLI's on-disk store — Claude Code (`~/.claude/projects`) and Codex
// (`~/.codex/sessions`). ProjectRose surfaces them in the sidebar grouped
// under their Workspace, but never resumes or mutates them. See ADR 0016.
//
// Pure types only, no IO — safe to import from main or renderer.

export type ExternalSource = 'claude-code' | 'codex'

export interface ExternalSessionMeta {
  source: ExternalSource
  id: string
  title: string
  // Absolute Workspace path (the session's real cwd). When a session's file
  // carries no cwd, this falls back to the decoded directory name and
  // `approximatePath` is set so grouping can keep it separate.
  workspacePath: string
  approximatePath?: boolean
  createdAt: number
  updatedAt: number
  filePath: string
}

// Superset of DetachedRunTranscriptEntry (same 5 `kind`s) so the renderer's
// transcript cell components render both. Adds optional provenance fields that
// external stores carry but detached runs don't.
export type ExternalTranscriptEntry =
  | { kind: 'user_message'; content: string; timestamp?: string }
  | { kind: 'assistant_thought'; content: string; timestamp?: string }
  | { kind: 'assistant_message'; content: string; timestamp?: string; model?: string }
  | { kind: 'tool_call'; toolName: string; toolCallId: string; input: unknown; timestamp?: string }
  | {
      kind: 'tool_result'
      toolName: string
      toolCallId: string
      output: string
      isError?: boolean
      timestamp?: string
    }

export interface ExternalTranscript {
  source: ExternalSource
  id: string
  title: string
  workspacePath: string
  entries: ExternalTranscriptEntry[]
  // Set when the transcript was capped at MAX_TRANSCRIPT_ENTRIES.
  entryCountTruncated?: boolean
}

// Result of a poll-friendly transcript read: the fresh transcript plus the
// file's mtime, which the caller passes back next poll to skip re-parsing an
// unchanged file.
export interface ExternalTranscriptUpdate {
  transcript: ExternalTranscript
  mtimeMs: number
}

// Hard cap so a runaway multi-MB session can't blow up the renderer.
export const MAX_TRANSCRIPT_ENTRIES = 2000
