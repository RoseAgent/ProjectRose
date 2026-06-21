// Slack runtime for rose-channels. Uses Socket Mode (no public webhook URL
// required) + the Web API for sends and channel listing.
//
// The user creates a Slack app at api.slack.com/apps, enables Socket Mode,
// generates an app-level token (xapp-...) with `connections:write`, installs
// the bot user, and pastes the bot token (xoxb-...) + app token into the
// rose-channels settings panel. See README/ADR for the exact scope list.

import { SocketModeClient } from '@slack/socket-mode'
import { WebClient } from '@slack/web-api'

export interface SlackChannelInfo {
  id: string
  name: string
  /** "workspace-id / #channel-name" or "DM with user-id". */
  displayLabel: string
}

export interface IncomingSlackMessage {
  channelId: string
  channelDisplay: string
  /** Slack's `ts` value — the per-channel monotonic id used for replies. */
  messageId: string
  author: string
  body: string
}

export interface SlackHistoryMessage {
  /** Slack's per-channel `ts` — also the message id used by replies. */
  ts: string
  channelId: string
  /** Sender user id (e.g. U02ABCDEF), or empty when subtype hides it. */
  userId: string
  text: string
  /** Thread parent's ts when this message is inside a thread, else undefined. */
  threadTs?: string
}

export interface SlackUserInfo {
  id: string
  name: string
  realName: string
  isBot: boolean
}

export interface SlackRuntime {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  botName(): string | null
  listChannels(): Promise<SlackChannelInfo[]>
  sendMessage(channelId: string, content: string): Promise<{ messageId: string }>
  replyToThread(
    channelId: string,
    threadTs: string,
    content: string
  ): Promise<{ messageId: string }>
  /**
   * Fetch the most recent `limit` messages in a channel. When `threadTs` is
   * supplied, returns the messages of that thread instead of the channel's
   * top-level messages.
   */
  fetchHistory(
    channelId: string,
    limit: number,
    threadTs?: string
  ): Promise<SlackHistoryMessage[]>
  fetchUser(userId: string): Promise<SlackUserInfo>
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>
}

export type SlackMessageHandler = (msg: IncomingSlackMessage) => void

interface SlackEventEnvelope {
  type: string
  event?: {
    type: string
    channel?: string
    user?: string
    text?: string
    ts?: string
    bot_id?: string
    subtype?: string
  }
}

export function createSlackRuntime(
  botToken: string,
  appToken: string,
  onMessage: SlackMessageHandler
): SlackRuntime {
  const web = new WebClient(botToken)
  const socket = new SocketModeClient({ appToken })

  let connected = false
  let botId: string | null = null
  let botUserName: string | null = null

  socket.on('events_api', async ({ ack, body }: { ack: () => Promise<void>; body: unknown }) => {
    await ack()
    const envelope = body as SlackEventEnvelope
    const event = envelope.event
    if (!event || event.type !== 'message') return
    // Skip non-user message subtypes (channel join, bot message, edits…).
    if (event.subtype) return
    if (event.bot_id) return
    if (botId && event.user === botId) return // safety net
    if (!event.channel || !event.text || !event.ts) return
    onMessage({
      channelId: event.channel,
      channelDisplay: event.channel,
      messageId: event.ts,
      author: event.user ?? 'unknown',
      body: event.text
    })
  })

  return {
    async connect(): Promise<void> {
      if (connected) return
      await socket.start()
      // Look up bot identity so we can filter our own posts and surface a tag.
      try {
        const auth = await web.auth.test()
        botId = (auth.user_id as string | undefined) ?? null
        botUserName = (auth.user as string | undefined) ?? null
      } catch {
        /* tolerate — bot still listens, just no tag display */
      }
      connected = true
    },
    async disconnect(): Promise<void> {
      if (!connected) return
      connected = false
      await socket.disconnect()
    },
    isConnected(): boolean {
      return connected
    },
    botName(): string | null {
      return botUserName
    },
    async listChannels(): Promise<SlackChannelInfo[]> {
      const out: SlackChannelInfo[] = []
      // conversations.list returns up to 1000 entries per page; one page is
      // plenty for typical personal workspaces. Pagination can be added if
      // someone hits the limit.
      const resp = await web.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
        limit: 200
      })
      const channels = (resp.channels as Array<{ id?: string; name?: string }> | undefined) ?? []
      for (const c of channels) {
        if (!c.id || !c.name) continue
        out.push({
          id: c.id,
          name: `#${c.name}`,
          displayLabel: `#${c.name}`
        })
      }
      return out
    },
    async sendMessage(channelId, content): Promise<{ messageId: string }> {
      const resp = await web.chat.postMessage({ channel: channelId, text: content })
      return { messageId: (resp.ts as string | undefined) ?? '' }
    },
    async replyToThread(channelId, threadTs, content): Promise<{ messageId: string }> {
      const resp = await web.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: content
      })
      return { messageId: (resp.ts as string | undefined) ?? '' }
    },
    async fetchHistory(channelId, limit, threadTs): Promise<SlackHistoryMessage[]> {
      const capped = Math.max(1, Math.min(100, limit))
      // Slack returns newest first; reverse so the array reads chronologically.
      if (threadTs) {
        const resp = await web.conversations.replies({
          channel: channelId,
          ts: threadTs,
          limit: capped
        })
        const messages =
          (resp.messages as Array<{
            ts?: string
            user?: string
            text?: string
            thread_ts?: string
          }> | undefined) ?? []
        return messages.map((m) => ({
          ts: m.ts ?? '',
          channelId,
          userId: m.user ?? '',
          text: m.text ?? '',
          threadTs: m.thread_ts
        }))
      }
      const resp = await web.conversations.history({
        channel: channelId,
        limit: capped
      })
      const messages =
        (resp.messages as Array<{
          ts?: string
          user?: string
          text?: string
          thread_ts?: string
        }> | undefined) ?? []
      return messages
        .slice()
        .reverse()
        .map((m) => ({
          ts: m.ts ?? '',
          channelId,
          userId: m.user ?? '',
          text: m.text ?? '',
          threadTs: m.thread_ts
        }))
    },
    async fetchUser(userId): Promise<SlackUserInfo> {
      const resp = await web.users.info({ user: userId })
      const user = resp.user as
        | {
            id?: string
            name?: string
            real_name?: string
            is_bot?: boolean
          }
        | undefined
      return {
        id: user?.id ?? userId,
        name: user?.name ?? '',
        realName: user?.real_name ?? '',
        isBot: user?.is_bot ?? false
      }
    },
    async addReaction(channelId, messageId, emoji): Promise<void> {
      // Slack reaction names are lowercase without colons; strip any leading/
      // trailing colons the caller passed (`:thumbsup:` → `thumbsup`).
      const name = emoji.replace(/^:|:$/g, '')
      await web.reactions.add({
        channel: channelId,
        timestamp: messageId,
        name
      })
    }
  }
}
