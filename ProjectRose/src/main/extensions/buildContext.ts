// Capability slicer for the extension main context.
//
// The host has a single "full" set of methods it could hand any extension.
// Today's loader hands the full set to every extension, regardless of what
// its manifest declares. This module replaces that with a slicer that:
//
//   1. Always exposes the "free" surface — fields that don't talk to host
//      services and are safe for any extension: `rootPath`, `getSettings`,
//      `updateSettings`. The first two persist per-workspace per-extension
//      data and have no cross-extension reach.
//
//   2. Conditionally exposes capability-gated methods according to
//      `manifest.provides`:
//          agentTools       -> registerTools
//          chatHooks        -> registerHooks
//          backgroundAgent  -> runBackgroundAgent
//          agentSession     -> openAgentSession
//          notifyStatus     -> notifyStatus
//          broadcast        -> broadcast
//
//   3. When a capability is NOT declared, the corresponding method becomes
//      a throwing stub. An extension that calls `ctx.broadcast(...)` without
//      `broadcast: true` in its manifest gets a clear runtime error
//      identifying the missing capability — the host catches manifest drift
//      instead of silently doing the action.
//
// Phase 2 will retire the un-sliced loader (#37). Until then the slicer is
// the only thing the loader uses — extensions whose manifest under-declares
// will surface drift via these stubs.

import type { ExtensionManifest, ExtensionToolEntry } from '../../shared/extension-types'
import type { ChatHook } from '../../shared/extensionHooks'
import type { ExtensionMainContext } from '../../shared/extension-contract'
import type { AgentSession } from '../../shared/extension-agent-session'
import type { DetachedRunTranscript } from '../../shared/detachedRunTranscript'
import { logActivity } from '../services/memory/agentActivity'

/** Full host surface, with no manifest gating. The slicer picks from this. */
export interface HostExtensionSurface {
  rootPath: string
  getSettings: () => Promise<Record<string, unknown>>
  updateSettings: (patch: Record<string, unknown>) => Promise<void>
  /** @deprecated No-op. Kept for backward compatibility with older extensions. */
  registerSensitiveFields: (keys: string[]) => void
  broadcast: (channel: string, data: unknown) => void
  notifyStatus: (
    text: string,
    opts?: { tone?: 'info' | 'success' | 'error' | 'warning'; durationMs?: number }
  ) => void
  registerTools: (tools: ExtensionToolEntry[]) => void
  registerHooks: (hooks: ChatHook[]) => void
  runBackgroundAgent: (prompt: string, systemPrompt: string) => Promise<string>
  runDetachedRunWithTools: (
    prompt: string,
    systemPrompt: string,
    options: { allowedTools: string[] }
  ) => Promise<DetachedRunTranscript>
  openAgentSession: (opts: { systemPrompt: string }) => AgentSession
}

/**
 * Mapping from capability flag in `provides` to the ctx method it unlocks.
 * Exported so tests and tooling can introspect the contract without
 * duplicating the table.
 */
export const CAPABILITY_TO_METHOD = {
  agentTools: 'registerTools',
  chatHooks: 'registerHooks',
  backgroundAgent: 'runBackgroundAgent',
  detachedRunWithTools: 'runDetachedRunWithTools',
  agentSession: 'openAgentSession',
  notifyStatus: 'notifyStatus',
  broadcast: 'broadcast'
} as const

type GatedMethod = (typeof CAPABILITY_TO_METHOD)[keyof typeof CAPABILITY_TO_METHOD]

function makeMissingCapabilityStub(extensionId: string, capability: string, method: GatedMethod): (...args: unknown[]) => never {
  return (..._args: unknown[]): never => {
    throw new Error(
      `${extensionId}: ctx.${method}() called but "${capability}" capability not declared in rose-extension.json provides`
    )
  }
}

// Memory activity-log preview cap. Long prompts/results balloon the JSONL
// quickly; this keeps it browsable without losing the lead.
const PREVIEW_LEN = 200
function truncatePreview(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= PREVIEW_LEN ? clean : clean.slice(0, PREVIEW_LEN) + '…'
}

/**
 * Build a sliced `ExtensionMainContext` for a single extension based on the
 * capabilities declared in its manifest.
 */
export function buildContext(opts: {
  extensionId: string
  manifest: ExtensionManifest
  host: HostExtensionSurface
}): ExtensionMainContext {
  const { extensionId, manifest, host } = opts
  const provides = manifest.provides ?? {}

  const broadcast = provides.broadcast
    ? host.broadcast
    : (makeMissingCapabilityStub(extensionId, 'broadcast', 'broadcast') as HostExtensionSurface['broadcast'])

  const notifyStatus = provides.notifyStatus
    ? host.notifyStatus
    : (makeMissingCapabilityStub(extensionId, 'notifyStatus', 'notifyStatus') as HostExtensionSurface['notifyStatus'])

  const registerTools = provides.agentTools
    ? host.registerTools
    : (makeMissingCapabilityStub(extensionId, 'agentTools', 'registerTools') as HostExtensionSurface['registerTools'])

  const registerHooks = provides.chatHooks
    ? host.registerHooks
    : (makeMissingCapabilityStub(extensionId, 'chatHooks', 'registerHooks') as HostExtensionSurface['registerHooks'])

  const runBackgroundAgent: HostExtensionSurface['runBackgroundAgent'] = provides.backgroundAgent
    ? async (prompt, systemPrompt) => {
        // Memory: log start + end of every Detached Run so the diary writer
        // sees that this extension delegated work to the agent.
        const preview = truncatePreview(prompt)
        void logActivity(extensionId, 'detached-run-start', `prompt: ${preview}`)
        try {
          const result = await host.runBackgroundAgent(prompt, systemPrompt)
          void logActivity(
            extensionId,
            'detached-run-end',
            `result: ${truncatePreview(result)}`
          )
          return result
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          void logActivity(extensionId, 'detached-run-end', `error: ${msg.slice(0, 200)}`)
          throw err
        }
      }
    : (makeMissingCapabilityStub(extensionId, 'backgroundAgent', 'runBackgroundAgent') as HostExtensionSurface['runBackgroundAgent'])

  const runDetachedRunWithTools: HostExtensionSurface['runDetachedRunWithTools'] = provides.detachedRunWithTools
    ? async (prompt, systemPrompt, options) => {
        const preview = truncatePreview(prompt)
        const toolList = options.allowedTools.join(',') || '(none)'
        void logActivity(
          extensionId,
          'detached-run-start',
          `tools: [${toolList}] prompt: ${preview}`
        )
        try {
          const transcript = await host.runDetachedRunWithTools(prompt, systemPrompt, options)
          void logActivity(
            extensionId,
            'detached-run-end',
            `final: ${truncatePreview(transcript.finalText)} (${transcript.durationMs}ms, ${transcript.entries.length} entries)`
          )
          return transcript
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          void logActivity(extensionId, 'detached-run-end', `error: ${msg.slice(0, 200)}`)
          throw err
        }
      }
    : (makeMissingCapabilityStub(
        extensionId,
        'detachedRunWithTools',
        'runDetachedRunWithTools'
      ) as HostExtensionSurface['runDetachedRunWithTools'])

  const openAgentSession: HostExtensionSurface['openAgentSession'] = provides.agentSession
    ? (opts) => {
        // Memory: log when an extension opens an Agent Handle and wrap the
        // returned handle so every .send() also lands in the activity log.
        void logActivity(
          extensionId,
          'agent-handle-open',
          `system: ${truncatePreview(opts.systemPrompt)}`
        )
        const handle = host.openAgentSession(opts)
        return {
          send: async (text: string) => {
            void logActivity(extensionId, 'agent-handle-message', `>>> ${truncatePreview(text)}`)
            try {
              const reply = await handle.send(text)
              void logActivity(extensionId, 'agent-handle-message', `<<< ${truncatePreview(reply)}`)
              return reply
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              void logActivity(extensionId, 'agent-handle-message', `error: ${msg.slice(0, 200)}`)
              throw err
            }
          },
          close: () => handle.close()
        }
      }
    : (makeMissingCapabilityStub(extensionId, 'agentSession', 'openAgentSession') as HostExtensionSurface['openAgentSession'])

  return {
    rootPath: host.rootPath,
    getSettings: host.getSettings,
    updateSettings: host.updateSettings,
    registerSensitiveFields: host.registerSensitiveFields,
    broadcast,
    notifyStatus,
    registerTools,
    registerHooks,
    runBackgroundAgent,
    runDetachedRunWithTools,
    openAgentSession
  }
}

/**
 * Returns the set of method names a manifest authorises. Useful for the
 * install UI (PRD issue #36) to render "this extension can: send messages,
 * read your settings, ...".
 */
export function listGrantedMethods(manifest: ExtensionManifest): string[] {
  const always = ['rootPath', 'getSettings', 'updateSettings']
  const provides = manifest.provides ?? {}
  const gated: string[] = []
  for (const [cap, method] of Object.entries(CAPABILITY_TO_METHOD) as Array<[keyof typeof CAPABILITY_TO_METHOD, GatedMethod]>) {
    if (provides[cap]) gated.push(method)
  }
  return [...always, ...gated]
}
