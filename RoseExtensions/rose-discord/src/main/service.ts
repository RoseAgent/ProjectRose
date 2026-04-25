import { Client, GatewayIntentBits, Partials } from 'discord.js'
import type { DiscordMessage, DiscordChannel } from '../renderer/store'

let _client: Client | null = null

function getClient(): Client {
  if (!_client) {
    _client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    })
  }
  return _client
}

export async function connect(token: string, onMessage: (channelId: string, msg: DiscordMessage) => void): Promise<DiscordChannel[]> {
  const client = getClient()
  if (client.isReady()) {
    return fetchDiscordChannels()
  }
  client.on('messageCreate', (msg) => {
    onMessage(msg.channelId, mapMessage(msg))
  })
  await client.login(token)
  return fetchDiscordChannels()
}

export async function disconnect(): Promise<void> {
  if (_client) {
    await _client.destroy()
    _client = null
  }
}

export async function fetchDiscordChannels(): Promise<DiscordChannel[]> {
  const client = getClient()
  if (!client.isReady()) return []
  const channels: DiscordChannel[] = []
  for (const guild of client.guilds.cache.values()) {
    const fullGuild = await guild.fetch()
    for (const [, channel] of fullGuild.channels.cache) {
      if (channel.isTextBased() && 'name' in channel) {
        channels.push({ id: channel.id, name: channel.name, guildId: guild.id, guildName: guild.name })
      }
    }
  }
  return channels
}

export async function fetchDiscordMessages(channelId: string, limit: number): Promise<DiscordMessage[]> {
  const client = getClient()
  if (!client.isReady()) return []
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return []
  const msgs = await channel.messages.fetch({ limit: Math.min(limit, 100) })
  return Array.from(msgs.values()).reverse().map(mapMessage)
}

export async function fetchOlderMessages(channelId: string, before: string, limit: number): Promise<DiscordMessage[]> {
  const client = getClient()
  if (!client.isReady()) return []
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return []
  const msgs = await channel.messages.fetch({ limit: Math.min(limit, 100), before })
  return Array.from(msgs.values()).reverse().map(mapMessage)
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<void> {
  const client = getClient()
  if (!client.isReady()) throw new Error('Discord not connected')
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) throw new Error('Channel not found or not text')
  await channel.send(content)
}

function mapMessage(msg: import('discord.js').Message): DiscordMessage {
  return {
    id: msg.id,
    timestamp: msg.createdAt.toISOString(),
    content: msg.content,
    authorUsername: msg.author.username,
    authorDisplayName: msg.member?.displayName ?? msg.author.displayName ?? msg.author.username,
    avatarUrl: msg.author.displayAvatarURL() ?? undefined,
    attachments: msg.attachments.map(a => ({ id: a.id, filename: a.name, url: a.url })),
    embeds: msg.embeds.map(e => ({
      title: e.title ?? undefined,
      url: e.url ?? undefined,
      description: e.description ?? undefined,
      fields: e.fields.map(f => ({ name: f.name, value: f.value })),
      image: e.image ? { url: e.image.url } : undefined
    })),
    reactions: msg.reactions.cache.map(r => ({ emoji: r.emoji.name ?? '', count: r.count }))
  }
}
