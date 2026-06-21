import { defineIpc, method } from '../../../../shared/ipc/defineIpc'
import type { ChannelRule } from '../../../../shared/channelRule'
import type { RunListEntry, ConnectionStatus, RemoteChannelInfo } from './main'

// IPC manifest for rose-channels. Bound flat on `window.api.channels.*` from
// preload (see src/preload/index.ts). The renderer half of rose-channels
// calls these methods directly — no extension SDK glue, since rose-channels
// is a built-in and may speak to host IPC.

export const channelsIpc = defineIpc('channels', {
  /** List every Channel Rule definition in the workspace. */
  list: method<[rootPath: string], Array<{ slug: string; rule: ChannelRule }>>(),
  /** Read a single rule by slug. Returns null when not found. */
  read: method<[rootPath: string, slug: string], ChannelRule | null>(),
  /**
   * Save or create a rule. If `slug` is empty the host derives one from
   * `rule.name`. Returns the canonical slug the file was written under.
   */
  save: method<[rootPath: string, slug: string, rule: ChannelRule], { slug: string }>(),
  /** Delete a rule definition file. Run history is preserved. */
  delete: method<[rootPath: string, slug: string], void>(),
  /**
   * Fire a rule ad-hoc against a hand-typed test message. Used by the
   * "Run Now" button in the rule editor. Returns immediately; the run
   * completes asynchronously and broadcasts `channels:changed` when done.
   */
  runNow: method<
    [
      rootPath: string,
      slug: string,
      testMessage: { author: string; body: string }
    ],
    { ok: boolean }
  >(),
  /** List runs for a rule, newest first. */
  listRuns: method<[rootPath: string, slug: string], RunListEntry[]>(),
  /** Read a single run transcript markdown. */
  readRun: method<[rootPath: string, slug: string, filename: string], string | null>(),

  /** Per-source connection status (whether a bot token is loaded and live). */
  status: method<[rootPath: string], { discord: ConnectionStatus; slack: ConnectionStatus }>(),

  /** Live channel picker — fetches from the connected bot. */
  listDiscordChannels: method<[rootPath: string], RemoteChannelInfo[]>(),
  listSlackChannels: method<[rootPath: string], RemoteChannelInfo[]>(),

  /** Settings — store/clear encrypted bot tokens. */
  setDiscordToken: method<[rootPath: string, token: string], { ok: boolean; error?: string }>(),
  clearDiscord: method<[rootPath: string], void>(),
  setSlackTokens: method<
    [rootPath: string, args: { botToken: string; appToken: string }],
    { ok: boolean; error?: string }
  >(),
  clearSlack: method<[rootPath: string], void>()
})
