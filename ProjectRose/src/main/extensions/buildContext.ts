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
    ? host.runBackgroundAgent
    : (makeMissingCapabilityStub(extensionId, 'backgroundAgent', 'runBackgroundAgent') as HostExtensionSurface['runBackgroundAgent'])

  const runDetachedRunWithTools: HostExtensionSurface['runDetachedRunWithTools'] = provides.detachedRunWithTools
    ? host.runDetachedRunWithTools
    : (makeMissingCapabilityStub(
        extensionId,
        'detachedRunWithTools',
        'runDetachedRunWithTools'
      ) as HostExtensionSurface['runDetachedRunWithTools'])

  const openAgentSession: HostExtensionSurface['openAgentSession'] = provides.agentSession
    ? host.openAgentSession
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
