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
  runtime: RuntimeBundle
  unsubscribeEmail: (() => void) | null
  /** Prevent overlapping fires of the same rule (e.g. burst on same channel). */
  running: Set<string>
}

// Single global state map keyed by rootPath. Workspace switch tears down the
// old entry; the renderer then re-triggers load against the new path.
const states = new Map<string, State>()

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

export async function getStatus(rootPath: string): Promise<{
  discord: ConnectionStatus
  slack: ConnectionStatus
}> {
  const state = states.get(rootPath)
  return {
    discord: {
      connected: state?.runtime.discord?.isConnected() ?? false,
      identity: state?.runtime.discord?.botTag() ?? null
    },
    slack: {
      connected: state?.runtime.slack?.isConnected() ?? false,
      identity: state?.runtime.slack?.botName() ?? null
    }
  }
}

export async function listDiscordChannels(rootPath: string): Promise<RemoteChannelInfo[]> {
  const runtime = states.get(rootPath)?.runtime.discord
  if (!runtime || !runtime.isConnected()) return []
  return runtime.listChannels().map((c) => ({
    id: c.id,
    displayLabel: c.displayLabel
  }))
}

export async function listSlackChannels(rootPath: string): Promise<RemoteChannelInfo[]> {
  const runtime = states.get(rootPath)?.runtime.slack
  if (!runtime || !runtime.isConnected()) return []
  const channels = await runtime.listChannels()
  return channels.map((c) => ({ id: c.id, displayLabel: c.displayLabel }))
}

// ── Token plumbing — settings ────────────────────────────────────────────

export async function setDiscordToken(
  rootPath: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await storeSetDiscordToken(token)
    const state = states.get(rootPath)
    if (state) await reconnectDiscord(state)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearDiscord(rootPath: string): Promise<void> {
  await storeSetDiscordToken(null)
  const state = states.get(rootPath)
  if (!state) return
  if (state.runtime.discord) {
    await state.runtime.discord.disconnect()
    state.runtime.discord = null
  }
}

export async function setSlackTokens(
  rootPath: string,
  args: { botToken: string; appToken: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await storeSetSlackTokens({ botToken: args.botToken, appToken: args.appToken })
    const state = states.get(rootPath)
    if (state) await reconnectSlack(state)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearSlack(rootPath: string): Promise<void> {
  await storeSetSlackTokens({ botToken: null, appToken: null })
  const state = states.get(rootPath)
  if (!state) return
  if (state.runtime.slack) {
    await state.runtime.slack.disconnect()
    state.runtime.slack = null
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

async function reconnectDiscord(state: State): Promise<void> {
  if (state.runtime.discord) {
    await state.runtime.discord.disconnect().catch(() => { /* ignore */ })
    state.runtime.discord = null
  }
  const secrets = await readChannelSecrets()
  if (!secrets.discordBotToken) return
  const dispatch = makeDispatcher(state, 'discord')
  const runtime = createDiscordRuntime(secrets.discordBotToken, (msg: IncomingDiscordMessage) => {
    void dispatch(msg.channelId, msg.channelDisplay, msg.messageId, msg.author, msg.body)
  })
  try {
    await runtime.connect()
    state.runtime.discord = runtime
  } catch (err) {
    state.ctx.notifyStatus(
      `Channels: Discord connection failed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: 'error', durationMs: 6000 }
    )
  }
}

async function reconnectSlack(state: State): Promise<void> {
  if (state.runtime.slack) {
    await state.runtime.slack.disconnect().catch(() => { /* ignore */ })
    state.runtime.slack = null
  }
  const secrets = await readChannelSecrets()
  if (!secrets.slackBotToken || !secrets.slackAppToken) return
  const dispatch = makeDispatcher(state, 'slack')
  const runtime = createSlackRuntime(
    secrets.slackBotToken,
    secrets.slackAppToken,
    (msg: IncomingSlackMessage) => {
      void dispatch(msg.channelId, msg.channelDisplay, msg.messageId, msg.author, msg.body)
    }
  )
  try {
    await runtime.connect()
    state.runtime.slack = runtime
  } catch (err) {
    state.ctx.notifyStatus(
      `Channels: Slack connection failed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: 'error', durationMs: 6000 }
    )
  }
}

// ── Registration entry ──────────────────────────────────────────────────

export function register(ctx: ExtensionMainContext): () => void {
  const rootPath = ctx.rootPath
  if (!rootPath) return () => {}

  const state: State = {
    rootPath,
    ctx,
    runtime: { discord: null, slack: null },
    unsubscribeEmail: null,
    running: new Set()
  }
  states.set(rootPath, state)

  ctx.registerTools(buildChannelsTools(state.runtime))

  // Email subscriber — always on. The emitter just doesn't fire until a
  // transport is configured.
  const emailDispatch = makeDispatcher(state, 'email')
  state.unsubscribeEmail = subscribeToEmail((msg: IncomingEmailNotification) => {
    void emailDispatch(msg.fromAddress, null, msg.messageId, msg.authorDisplay, msg.body)
  })

  // Bring up bot transports asynchronously so register() returns promptly.
  void (async () => {
    try {
      await reconnectDiscord(state)
      await reconnectSlack(state)
    } catch (err) {
      console.error('[rose-channels] initial connect failed:', err)
    }
  })()

  return () => {
    state.unsubscribeEmail?.()
    state.unsubscribeEmail = null
    void state.runtime.discord?.disconnect().catch(() => { /* ignore */ })
    void state.runtime.slack?.disconnect().catch(() => { /* ignore */ })
    state.runtime.discord = null
    state.runtime.slack = null
    state.running.clear()
    states.delete(rootPath)
  }
}
