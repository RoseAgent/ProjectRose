import { defineIpc, method } from '../../shared/ipc/defineIpc'
import type { Conversation } from './conversationStore'
import type { WorkspaceGroupedList, KnownWorkspace } from '../../shared/conversationGroups'
import type {
  ExternalSource,
  ExternalTranscript,
  ExternalTranscriptUpdate
} from '../../shared/externalSession'

// Conversations are listed globally and grouped by Workspace in the main
// process; the renderer receives the finished grouped list. load/save/delete
// key off sessionId alone — the group directory is resolved from the store's
// index, and each saved Conversation carries its own workspacePath.
export const sessionIpc = defineIpc('session', {
  listAll: method<[], WorkspaceGroupedList>(),
  load: method<[sessionId: string], Conversation | null>(),
  save: method<[conversation: Conversation], void>(),
  delete: method<[sessionId: string], void>()
})

// Read-only transcript access for External Sessions (Claude Code / Codex).
// getTranscriptUpdate is the polling variant: it stats the file and returns
// null unless it changed since the given mtime, so a few-second poll is cheap.
export const externalIpc = defineIpc('external', {
  getTranscript: method<[source: ExternalSource, id: string], ExternalTranscript | null>(),
  getTranscriptUpdate: method<
    [source: ExternalSource, id: string, sinceMtimeMs: number],
    ExternalTranscriptUpdate | null
  >()
})

// Known-workspace enumeration for the New Conversation picker.
export const workspacesIpc = defineIpc('workspaces', {
  listKnown: method<[], KnownWorkspace[]>()
})
