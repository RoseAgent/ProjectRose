// Discord gateway client for rose-channels. Wraps discord.js so the rest of
// the extension talks to a small typed surface.
//
// The client is constructed lazily (only when a bot token is present) and
// torn down when the workspace closes or the user clears the token. Channel
// listing is used by the renderer's picker; messageCreate forwards every
// incoming text message to the supplied onMessage callback for matching.

import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  ThreadChannel,
  DMChannel,
  type Message
} from 'discord.js'

export interface DiscordChannelInfo {
  id: string
  name: string
  guildName: string
  /** "guild-name / #channel-name" or "DM with userTag". */
  displayLabel: string
}

export interface IncomingDiscordMessage {
  channelId: string
  /** "guild-name / #channel-name" or "DM with userTag". */
  channelDisplay: string
  messageId: string
  author: string
  body: string
}

export interface DiscordHistoryMessage {
  id: string
  channelId: string
  author: string
  authorId: string
  content: string
  /** Unix ms. */
  createdAt: number
}

export interface DiscordUserInfo {
  id: string
  tag: string
  /** Display name (server nickname when fetched in a guild context, else username). */
  displayName: string
  bot: boolean
}

export interface DiscordRuntime {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  /** Once connected, the bot's user tag, e.g. "MyBot#1234". */
  botTag(): string | null
  listChannels(): DiscordChannelInfo[]
  sendMessage(channelId: string, content: string): Promise<{ messageId: string }>
  replyTo(messageId: string, channelId: string, content: string): Promise<{ messageId: string }>
  /** Fetch the most recent `limit` messages in a channel, optionally before a given id. */
  fetchHistory(
    channelId: string,
    limit: number,
    beforeMessageId?: string
  ): Promise<DiscordHistoryMessage[]>
  /** Fetch a single user by id. */
  fetchUser(userId: string): Promise<DiscordUserInfo>
  /** Add an emoji reaction to a message. `emoji` is the unicode glyph or `name:id` for custom. */
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>
}

export type DiscordMessageHandler = (msg: IncomingDiscordMessage) => void

export function createDiscordRuntime(
  token: string,
  onMessage: DiscordMessageHandler
): DiscordRuntime {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
  })

  let connected = false

  function channelLabel(message: Message): string {
    const channel = message.channel
    if (channel instanceof TextChannel) {
      return `${channel.guild?.name ?? 'guild'} / #${channel.name}`
    }
    if (channel instanceof ThreadChannel) {
      return `${channel.guild?.name ?? 'guild'} / thread ${channel.name}`
    }
    if (channel instanceof DMChannel) {
      return `DM with ${message.author.tag}`
    }
    return `channel ${channel.id}`
  }

  client.on('messageCreate', (message) => {
    // Ignore the bot's own posts so a reply tool call doesn't recurse.
    if (message.author.id === client.user?.id) return
    if (!message.content) return
    onMessage({
      channelId: message.channel.id,
      channelDisplay: channelLabel(message),
      messageId: message.id,
      author: message.author.tag,
      body: message.content
    })
  })

  return {
    async connect(): Promise<void> {
      if (connected) return
      await client.login(token)
      connected = true
    },
    async disconnect(): Promise<void> {
      if (!connected) return
      connected = false
      await client.destroy()
    },
    isConnected(): boolean {
      return connected && client.user !== null
    },
    botTag(): string | null {
      return client.user?.tag ?? null
    },
    listChannels(): DiscordChannelInfo[] {
      const out: DiscordChannelInfo[] = []
      for (const [, guild] of client.guilds.cache) {
        for (const [, channel] of guild.channels.cache) {
          if (channel instanceof TextChannel) {
            out.push({
              id: channel.id,
              name: `#${channel.name}`,
              guildName: guild.name,
              displayLabel: `${guild.name} / #${channel.name}`
            })
          }
        }
      }
      return out
    },
    async sendMessage(channelId, content): Promise<{ messageId: string }> {
      const channel = await client.channels.fetch(channelId)
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        throw new Error(`Discord channel ${channelId} is not a sendable text channel.`)
      }
      const sent = await channel.send(content)
      return { messageId: sent.id }
    },
    async replyTo(messageId, channelId, content): Promise<{ messageId: string }> {
      const channel = await client.channels.fetch(channelId)
      if (!channel || !channel.isTextBased() || !('messages' in channel)) {
        throw new Error(`Discord channel ${channelId} is not a sendable text channel.`)
      }
      const original = await channel.messages.fetch(messageId)
      const sent = await original.reply(content)
      return { messageId: sent.id }
    },
    async fetchHistory(channelId, limit, beforeMessageId): Promise<DiscordHistoryMessage[]> {
      const channel = await client.channels.fetch(channelId)
      if (!channel || !channel.isTextBased() || !('messages' in channel)) {
        throw new Error(`Discord channel ${channelId} is not a readable text channel.`)
      }
      const fetchOpts: { limit: number; before?: string } = {
        limit: Math.max(1, Math.min(100, limit))
      }
      if (beforeMessageId) fetchOpts.before = beforeMessageId
      const collection = await channel.messages.fetch(fetchOpts)
      // Discord returns newest first; reverse so the array reads chronologically.
      return [...collection.values()]
        .reverse()
        .map((m) => ({
          id: m.id,
          channelId: m.channel.id,
          author: m.author.tag,
          authorId: m.author.id,
          content: m.content,
          createdAt: m.createdTimestamp
        }))
    },
    async fetchUser(userId): Promise<DiscordUserInfo> {
      const user = await client.users.fetch(userId)
      return {
        id: user.id,
        tag: user.tag,
        displayName: user.globalName ?? user.username,
        bot: user.bot
      }
    },
    async addReaction(channelId, messageId, emoji): Promise<void> {
      const channel = await client.channels.fetch(channelId)
      if (!channel || !channel.isTextBased() || !('messages' in channel)) {
        throw new Error(`Discord channel ${channelId} is not a readable text channel.`)
      }
      const message = await channel.messages.fetch(messageId)
      await message.react(emoji)
    }
  }
}
