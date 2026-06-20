// Single import surface for extension authors.
//
// This module is the public contract between the host (ProjectRose) and
// extensions. Everything an extension is allowed to depend on is re-exported
// from here; anything not exported from this file is by definition NOT part
// of the contract and may move or change without notice.
//
// Extensions should import only from '@shared/extension-contract' (or the
// equivalent alias the extension's bundler resolves to this file).

// --- Manifest and installation ---------------------------------------------
export type {
  ExtensionManifest,
  InstalledExtension,
  ExtensionToolEntry,
  ExtensionToolCtx,
  ExtensionToolParameter,
  ExtensionToolDefinition
} from './extension-types'

// --- Chat hooks ------------------------------------------------------------
export type {
  ChatHook,
  ChatHookManifestEntry,
  HookType,
  HookEvent,
  HookInjectionPolicy,
  ThoughtHookEvent,
  MessageHookEvent,
  TokenHookEvent,
  ToolCallHookEvent,
  UserMessageHookEvent,
  HookResult,
  InjectionRecord
} from './extensionHooks'

export {
  MAX_INJECTIONS_PER_TURN_WHEN_ALLOW_MULTIPLE,
  DEFAULT_HOOK_PRIORITY,
  DEFAULT_INJECTION_POLICY
} from './extensionHooks'

// --- Manifest validator (host enforces this at install + load time) -------
export type {
  Capability,
  ManifestValidationIssue,
  ValidateManifestResult
} from './extension-manifest-validator'
export {
  CAPABILITY_KEYS,
  validateManifest,
  formatManifestIssues
} from './extension-manifest-validator'

// --- User-facing capability copy -------------------------------------------
// Single source of truth for the human-readable description of each
// capability. The install dialog renders these so the user sees what an
// extension is asking for before accepting. Keep entries terse and
// action-oriented; this is permission copy, not documentation.
import type { Capability as _Capability } from './extension-manifest-validator'

export const capabilityLabels: Readonly<Record<_Capability, string>> = Object.freeze({
  pageView: 'Show a panel in the sidebar',
  main: 'Run main-process code',
  projectSettings: 'Read/write project-scoped settings',
  globalSettings: 'Read/write global settings',
  agentTools: 'Register agent tools',
  chatHooks: 'Modify chat behavior (hooks)',
  agentSession: 'Open additional agent sessions',
  backgroundAgent: 'Run scheduled background tasks',
  detachedRunWithTools: 'Run scheduled prompts with selected tools',
  notifyStatus: 'Show status notifications',
  broadcast: 'Broadcast IPC events'
})

// --- Agent session ---------------------------------------------------------
// Note: this re-exports only the type. The session implementation lives in
// the host (`src/main/services/agentSession.ts`) and is constructed by the
// host when an extension calls `ctx.openAgentSession(...)`.
export type { AgentSession } from './extension-agent-session'

// --- Detached Run with tools (ADR 0014, renamed in ADR 0015) --------------
// Sibling to `runBackgroundAgent`. The host runs a one-shot Agent turn with
// a pre-filtered tool set (the `allowedTools` allowlist; interactive tools
// like `ask_user` / `screenshot` are auto-stripped) and returns a structured
// transcript instead of a single string. The transcript is consumer-agnostic
// — rose-routines wraps it in a RoutineRunRecord, rose-channels in a
// ChannelRuleRunRecord; each extension owns its own per-fire wrapper.
export type {
  DetachedRunTranscript,
  DetachedRunTranscriptEntry
} from './detachedRunTranscript'

// --- View id ---------------------------------------------------------------
// New rule, documented as part of the contract: **`manifest.id` IS the
// extension's `viewId`.** The renderer routes saved view-state (nav tab,
// last-open extension, etc.) by manifest id. Every new extension gets this
// for free.
//
// The map below exists only to honour saved state from pre-namespaced
// installs (when first-party extensions shipped under bare names like
// `discord` or `git`, before the `rose-*` prefix convention). This is a
// frozen legacy table — DO NOT add new entries. New extensions must use
// their `rose-<name>` id directly.
//
// A future release will sunset this by running a one-shot upgrade migration
// against saved viewIds in user settings; once nothing on disk references
// the legacy names, this map can be removed.
export const legacyViewIdAliases: Readonly<Record<string, string>> = Object.freeze({
  discord: 'rose-discord',
  email: 'rose-email',
  git: 'rose-git',
  docker: 'rose-docker',
  heartbeat: 'rose-heartbeat'
})

// --- Main-process context handed to extensions on register() ---------------
import type {
  ExtensionToolEntry,
  ExtensionToolCtx as _ExtensionToolCtx
} from './extension-types'
import type { ChatHook } from './extensionHooks'
import type { AgentSession } from './extension-agent-session'
import type { DetachedRunTranscript } from './detachedRunTranscript'

// Suppress unused import warning — kept for documentation that ToolCtx is
// part of this contract.
type _ToolCtxAlias = _ExtensionToolCtx

/**
 * Context object passed to an extension's `register(ctx)` entry point.
 *
 * The host constructs one of these per loaded extension. Extensions should
 * treat it as the only legal channel for talking to the host.
 */
export interface ExtensionMainContext {
  /** Absolute path to the currently-open project root. */
  rootPath: string

  /**
   * Read this extension's per-workspace settings object.
   * Backed by <workspace>/.projectrose/extensions/<id>/settings.json. Other
   * extensions cannot see these settings.
   */
  getSettings: () => Promise<Record<string, unknown>>

  /**
   * Merge a patch into this extension's per-workspace settings object.
   * Backed by <workspace>/.projectrose/extensions/<id>/settings.json.
   */
  updateSettings: (patch: Record<string, unknown>) => Promise<void>

  /** Send a message to all renderer windows on the given IPC channel. */
  broadcast: (channel: string, data: unknown) => void

  /** Surface a transient message in the renderer's bottom status bar. */
  notifyStatus: (
    text: string,
    opts?: { tone?: 'info' | 'success' | 'error' | 'warning'; durationMs?: number }
  ) => void

  /** Register the runtime tools this extension provides. */
  registerTools: (tools: ExtensionToolEntry[]) => void

  /**
   * @deprecated No-op. Settings are now stored in per-workspace per-extension
   * files (<workspace>/.projectrose/extensions/<id>/settings.json); sensitive
   * vs non-sensitive is no longer a host-side distinction. Existing extensions
   * may continue to call this, but the call has no effect.
   */
  registerSensitiveFields: (keys: string[]) => void

  /**
   * Run a one-shot background agent turn with the supplied prompt and system
   * prompt. The host returns the assistant's final text content. Hooks do
   * NOT fire during background-agent runs.
   */
  runBackgroundAgent: (prompt: string, systemPrompt: string) => Promise<string>

  /**
   * Run a one-shot Agent turn with an explicit tool allowlist, returning a
   * structured transcript instead of a single string. Interactive tools
   * (`ask_user`, `screenshot`) are auto-stripped from the allowlist before
   * the model sees the toolbox — routines run with no user present. Hooks
   * do NOT fire during these runs. See ADR 0014.
   */
  runDetachedRunWithTools: (
    prompt: string,
    systemPrompt: string,
    options: { allowedTools: string[] }
  ) => Promise<DetachedRunTranscript>

  /**
   * Register chat hooks. Hooks fire only for the user-visible main chat;
   * they do NOT fire inside runBackgroundAgent or openAgentSession.send.
   */
  registerHooks: (hooks: ChatHook[]) => void

  /**
   * Open a multi-turn agent session. Each session keeps its own message
   * history; subsequent send() calls reuse it. Hooks do not fire during
   * these calls.
   */
  openAgentSession: (opts: { systemPrompt: string }) => AgentSession
}
