// rose-channels — main-process module (ADR 0015).
//
// On register(): loads any persisted bot tokens, brings the Discord and Slack
// clients online, subscribes to the email service's `new-message` event, and
// wires every arrival through `channelRuleMatcher` → `fireChannelRule`. The
// cleanup function returned from register() is the strict workspace-local
// teardown: socket disconnects, listener removal, in-flight markers cleared.
//
// IPC handlers (rules CRUD, picker, secrets) live as exported functions; the
// host's IPC registry binds them via channelsService.ipc.ts.

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { ExtensionMainContext } from '@shared/extension-contract'
import { isoLocal } from '@shared/detachedRunTranscript'
import type { ChannelRule, ChannelSource } from '@shared/channelRule'
import {
  deleteRule as storeDeleteRule,
  listRules as storeListRules,
  readRule as storeReadRule,
  runsDirFor,
  saveRule as storeSaveRule
} from './channelRuleStore'
import { matchRule } from './channelRuleMatcher'
import { CHANNELS_CHANGED_CHANNEL, fireChannelRule, type IncomingMessage } from './channelRuleRunner'
import {
  readChannelSecrets,
  setDiscordToken as storeSetDiscordToken,
  setSlackTokens as storeSetSlackTokens
} from './credentialsStore'
import {
  createDiscordRuntime,
  type DiscordRuntime,
  type IncomingDiscordMessage
} from './discordClient'
import {
  createSlackRuntime,
  type IncomingSlackMessage,
  type SlackRuntime
} from './slackClient'
import { subscribeToEmail, type IncomingEmailNotification } from './emailSubscriber'
import { buildChannelsTools } from './tools'

export { manifest } from './manifest'

// Runtime carriers — used by the tools module to actually post messages.
export interface RuntimeBundle {
  discord: DiscordRuntime | null
  slack: SlackRuntime | null
}

export type ConnectionStatus = {
  connected: boolean
  /** Human-readable identity once connected (bot tag or user name). */
  identity: string | null
}

export interface RemoteChannelInfo {
  id: string
  displayLabel: string
}

interface State {
  rootPath: string
  ctx: ExtensionMainContext
  unsubscribeEmail: (() => void) | null
  /** Prevent overlapping fires of the same rule (e.g. burst on same channel). */
  running: Set<string>
}

// One State per always-on Workspace (ADR 0017). Multiple can be live at once.
const states = new Map<string, State>()

// Discord/Slack bot tokens are agent-global (credentialsStore is not
// workspace-scoped), so there is exactly ONE socket per platform shared across
// every always-on Workspace. Each incoming message fans out to every
// Workspace's rule matcher — a message matching rules in two Workspaces fires
// both (correct fan-out, not a duplicate). Without this, N always-on
// Workspaces would open N gateway connections on the same token.
let sharedDiscord: DiscordRuntime | null = null
let sharedSlack: SlackRuntime | null = null
let discordConnecting: Promise<void> | null = null
let slackConnecting: Promise<void> | null = null

// A live view of the shared runtimes for the tools module — its handlers read
// `.discord`/`.slack` at call time, so getters keep them current.
const sharedRuntime: RuntimeBundle = {
  get discord(): DiscordRuntime | null {
    return sharedDiscord
  },
  get slack(): SlackRuntime | null {
    return sharedSlack
  }
}

function fanOut(source: ChannelSource, msg: {
  identifier: string
  identifierDisplay: string | null
  messageId: string
  author: string
  body: string
}): void {
  for (const state of states.values()) {
    void makeDispatcher(state, source)(
      msg.identifier,
      msg.identifierDisplay,
      msg.messageId,
      msg.author,
      msg.body
    )
  }
}

function notifyAll(text: string): void {
  for (const state of states.values()) {
    state.ctx.notifyStatus(text, { tone: 'error', durationMs: 6000 })
  }
}

export interface RunListEntry {
  filename: string
  arrivedAt: string
  status: 'success' | 'failed'
  trigger: 'message' | 'manual'
  durationMs: number
}

// ── Public IPC-facing exports ───────────────────────────────────────────

export async function listRules(rootPath: string): ReturnType<typeof storeListRules> {
  return storeListRules(rootPath)
}

export async function readRule(rootPath: string, slug: string): ReturnType<typeof storeReadRule> {
  return storeReadRule(rootPath, slug)
}

export async function saveRule(
  rootPath: string,
  slug: string,
  rule: ChannelRule
): Promise<{ slug: string }> {
  const result = await storeSaveRule(rootPath, slug, rule)
  states.get(rootPath)?.ctx.broadcast(CHANNELS_CHANGED_CHANNEL, { rootPath })
  return result
}

export async function deleteRule(rootPath: string, slug: string): Promise<void> {
  await storeDeleteRule(rootPath, slug)
  states.get(rootPath)?.ctx.broadcast(CHANNELS_CHANGED_CHANNEL, { rootPath })
}

export async function listRuns(rootPath: string, slug: string): Promise<RunListEntry[]> {
  const dir = runsDirFor(rootPath, slug)
  let files: string[] = []
  try {
    files = await readdir(dir, 'utf-8')
  } catch {
    return []
  }
  const out: RunListEntry[] = []
  for (const filename of files) {
    if (!filename.endsWith('.md')) continue
    try {
      const content = await readFile(join(dir, filename), 'utf-8')
      const header = parseRunHeaderOnly(content)
      out.push({
        filename,
        arrivedAt: header.arrivedAt,
        status: header.status,
        trigger: header.trigger,
        durationMs: header.durationMs
      })
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (a.arrivedAt > b.arrivedAt ? -1 : 1))
  return out
}

export async function readRun(
  rootPath: string,
  slug: string,
  filename: string
): Promise<string | null> {
  try {
    return await readFile(join(runsDirFor(rootPath, slug), filename), 'utf-8')
  } catch {
    return null
  }
}

function parseRunHeaderOnly(content: string): {
  arrivedAt: string
  status: 'success' | 'failed'
  trigger: 'message' | 'manual'
  durationMs: number
} {
  const out = {
    arrivedAt: '',
    status: 'success' as 'success' | 'failed',
    trigger: 'message' as 'message' | 'manual',
    durationMs: 0
  }
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('## ')) break
    const m = line.match(/^\s*-\s+([a-z-]+):\s*(.+?)\s*$/)
    if (!m) continue
    const [, label, value] = m
    if (label === 'arrived-at') out.arrivedAt = value
    else if (label === 'status') out.status = value === 'failed' ? 'failed' : 'success'
    else if (label === 'trigger') out.trigger = value === 'manual' ? 'manual' : 'message'
    else if (label === 'duration-ms') out.durationMs = Number.parseInt(value, 10) || 0
  }
  return out
}

export async function runNow(
  rootPath: string,
  slug: string,
  testMessage: { author: string; body: string }
): Promise<{ ok: boolean }> {
  const state = states.get(rootPath)
  if (!state) return { ok: false }
  const rule = await storeReadRule(rootPath, slug)
  if (!rule) return { ok: false }
  const incoming: IncomingMessage = {
    source: rule.source,
    identifier: rule.identifier,
    identifierDisplay: rule.identifierDisplay,
    messageId: `manual-${Date.now()}`,
    author: testMessage.author || '(manual test)',
    body: testMessage.body,
    arrivedAt: isoLocal(new Date())
  }
  // Don't await — fire-and-forget; UI broadcast lands when done.
  void fireChannelRule({ rule, slug, incoming, trigger: 'manual', ctx: state.ctx })
  return { ok: true }
}

// Connection status reflects the shared socket, independent of which Workspace
// asks — the socket is agent-global.
export async function getStatus(_rootPath: string): Promise<{
  discord: ConnectionStatus
  slack: ConnectionStatus
}> {
  return {
    discord: {
      connected: sharedDiscord?.isConnected() ?? false,
      identity: sharedDiscord?.botTag() ?? null
    },
    slack: {
      connected: sharedSlack?.isConnected() ?? false,
      identity: sharedSlack?.botName() ?? null
    }
  }
}

export async function listDiscordChannels(_rootPath: string): Promise<RemoteChannelInfo[]> {
  if (!sharedDiscord || !sharedDiscord.isConnected()) return []
  return sharedDiscord.listChannels().map((c) => ({
    id: c.id,
    displayLabel: c.displayLabel
  }))
}

export async function listSlackChannels(_rootPath: string): Promise<RemoteChannelInfo[]> {
  if (!sharedSlack || !sharedSlack.isConnected()) return []
  const channels = await sharedSlack.listChannels()
  return channels.map((c) => ({ id: c.id, displayLabel: c.displayLabel }))
}

// ── Token plumbing — settings ────────────────────────────────────────────

export async function setDiscordToken(
  _rootPath: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await storeSetDiscordToken(token)
    await reconnectDiscord()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearDiscord(_rootPath: string): Promise<void> {
  await storeSetDiscordToken(null)
  if (sharedDiscord) {
    await sharedDiscord.disconnect().catch(() => { /* ignore */ })
    sharedDiscord = null
  }
}

export async function setSlackTokens(
  _rootPath: string,
  args: { botToken: string; appToken: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await storeSetSlackTokens({ botToken: args.botToken, appToken: args.appToken })
    await reconnectSlack()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearSlack(_rootPath: string): Promise<void> {
  await storeSetSlackTokens({ botToken: null, appToken: null })
  if (sharedSlack) {
    await sharedSlack.disconnect().catch(() => { /* ignore */ })
    sharedSlack = null
  }
}

// ── Internal: per-source connect helpers ────────────────────────────────

function makeDispatcher(state: State, source: ChannelSource) {
  return async (
    rawIdentifier: string,
    identifierDisplay: string | null,
    messageId: string,
    author: string,
    body: string
  ): Promise<void> => {
    const dedupeKey = `${source}:${rawIdentifier}:${messageId}`
    if (state.running.has(dedupeKey)) return
    const rules = await storeListRules(state.rootPath)
    const matched = matchRule(rules, source, rawIdentifier)
    if (!matched) return
    state.running.add(dedupeKey)
    try {
      await fireChannelRule({
        rule: matched.rule,
        slug: matched.slug,
        incoming: {
          source,
          identifier: rawIdentifier,
          identifierDisplay,
          messageId,
          author,
          body,
          arrivedAt: isoLocal(new Date())
        },
        trigger: 'message',
        ctx: state.ctx
      })
    } finally {
      state.running.delete(dedupeKey)
    }
  }
}

// Connect the single shared Discord socket if it isn't already up. Idempotent
// and concurrency-safe (one in-flight connect at a time).
async function ensureDiscordConnected(): Promise<void> {
  if (sharedDiscord?.isConnected()) return
  if (discordConnecting) return discordConnecting
  discordConnecting = (async () => {
    const secrets = await readChannelSecrets()
    if (!secrets.discordBotToken) return
    const runtime = createDiscordRuntime(secrets.discordBotToken, (msg: IncomingDiscordMessage) => {
      fanOut('discord', {
        identifier: msg.channelId,
        identifierDisplay: msg.channelDisplay,
        messageId: msg.messageId,
        author: msg.author,
        body: msg.body
      })
    })
    try {
      await runtime.connect()
      sharedDiscord = runtime
    } catch (err) {
      notifyAll(`Channels: Discord connection failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()
  try {
    await discordConnecting
  } finally {
    discordConnecting = null
  }
}

// Rebuild the shared Discord socket (e.g. after a token change). Token is
// agent-global, so this affects every always-on Workspace.
async function reconnectDiscord(): Promise<void> {
  if (sharedDiscord) {
    await sharedDiscord.disconnect().catch(() => { /* ignore */ })
    sharedDiscord = null
  }
  await ensureDiscordConnected()
}

async function ensureSlackConnected(): Promise<void> {
  if (sharedSlack?.isConnected()) return
  if (slackConnecting) return slackConnecting
  slackConnecting = (async () => {
    const secrets = await readChannelSecrets()
    if (!secrets.slackBotToken || !secrets.slackAppToken) return
    const runtime = createSlackRuntime(
      secrets.slackBotToken,
      secrets.slackAppToken,
      (msg: IncomingSlackMessage) => {
        fanOut('slack', {
          identifier: msg.channelId,
          identifierDisplay: msg.channelDisplay,
          messageId: msg.messageId,
          author: msg.author,
          body: msg.body
        })
      }
    )
    try {
      await runtime.connect()
      sharedSlack = runtime
    } catch (err) {
      notifyAll(`Channels: Slack connection failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()
  try {
    await slackConnecting
  } finally {
    slackConnecting = null
  }
}

async function reconnectSlack(): Promise<void> {
  if (sharedSlack) {
    await sharedSlack.disconnect().catch(() => { /* ignore */ })
    sharedSlack = null
  }
  await ensureSlackConnected()
}

// ── Registration entry ──────────────────────────────────────────────────

export function register(ctx: ExtensionMainContext): () => void {
  const rootPath = ctx.rootPath
  if (!rootPath) return () => {}

  const state: State = {
    rootPath,
    ctx,
    unsubscribeEmail: null,
    running: new Set()
  }
  states.set(rootPath, state)

  // Tools post through the shared runtimes (agent-global sockets).
  ctx.registerTools(buildChannelsTools(sharedRuntime))

  // Email subscriber — per-Workspace, always on. The emitter just doesn't fire
  // until a transport is configured.
  const emailDispatch = makeDispatcher(state, 'email')
  state.unsubscribeEmail = subscribeToEmail((msg: IncomingEmailNotification) => {
    void emailDispatch(msg.fromAddress, null, msg.messageId, msg.authorDisplay, msg.body)
  })

  // Ensure the shared bot transports are up (no-op if another Workspace already
  // brought them online). Async so register() returns promptly.
  void (async () => {
    try {
      await ensureDiscordConnected()
      await ensureSlackConnected()
    } catch (err) {
      console.error('[rose-channels] initial connect failed:', err)
    }
  })()

  return () => {
    state.unsubscribeEmail?.()
    state.unsubscribeEmail = null
    state.running.clear()
    states.delete(rootPath)
    // Tear the shared sockets down only when no Workspace needs them anymore.
    if (states.size === 0) {
      void sharedDiscord?.disconnect().catch(() => { /* ignore */ })
      void sharedSlack?.disconnect().catch(() => { /* ignore */ })
      sharedDiscord = null
      sharedSlack = null
    }
  }
}
