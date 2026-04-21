import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from 'discord.js'
import type { Message as DjsMessage, TextChannel } from 'discord.js'

export interface DiscordChannel {
  id: string
  name: string
  guildId: string
  guildName: string
  type: number
}

export interface DiscordAttachment {
  id: string
  filename: string
  url: string
  size: number
  contentType?: string
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  image?: { url: string }
  thumbnail?: { url: string }
  footer?: { text: string }
}

export interface DiscordReaction {
  emoji: string
  count: number
}

export interface DiscordMessage {
  id: string
  channelId: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
  avatarUrl: string | null
  content: string
  timestamp: string
  editedTimestamp: string | null
  attachments: DiscordAttachment[]
  embeds: DiscordEmbed[]
  reactions: DiscordReaction[]
  referencedMessageId: string | null
}

let client: Client | null = null
let currentToken = ''

function avatarUrl(userId: string, hash: string | null): string {
  if (hash) return `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=40`
  const idx = Number(BigInt(userId) >> 22n) % 6
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`
}

function mapMessage(msg: DjsMessage): DiscordMessage {
  return {
    id: msg.id,
    channelId: msg.channelId,
    authorId: msg.author.id,
    authorUsername: msg.author.username,
    authorDisplayName: msg.member?.displayName ?? msg.author.displayName ?? msg.author.username,
    avatarUrl: avatarUrl(msg.author.id, msg.author.avatar),
    content: msg.content,
    timestamp: msg.createdAt.toISOString(),
    editedTimestamp: msg.editedAt?.toISOString() ?? null,
    attachments: msg.attachments.map(a => ({
      id: a.id,
      filename: a.name,
      url: a.url,
      size: a.size,
      contentType: a.contentType ?? undefined
    })),
    embeds: msg.embeds.map(e => ({
      title: e.title ?? undefined,
      description: e.description ?? undefined,
      url: e.url ?? undefined,
      color: e.color ?? undefined,
      fields: e.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })),
      image: e.image ? { url: e.image.url } : undefined,
      thumbnail: e.thumbnail ? { url: e.thumbnail.url } : undefined,
      footer: e.footer ? { text: e.footer.text } : undefined
    })),
    reactions: msg.reactions.cache.map(r => ({
      emoji: r.emoji.name ?? r.emoji.id ?? '?',
      count: r.count
    })),
    referencedMessageId: msg.reference?.messageId ?? null
  }
}

export async function connectDiscord(
  token: string,
  onMessage: (msg: DiscordMessage) => void
): Promise<void> {
  if (token === currentToken && client?.isReady()) return

  if (client) {
    client.destroy()
    client = null
    currentToken = ''
  }

  const newClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions
    ]
  })

  newClient.on('messageCreate', (msg) => {
    if (msg.author.bot) return
    onMessage(mapMessage(msg))
  })

  await newClient.login(token)
  client = newClient
  currentToken = token
}

export function disconnectDiscord(): void {
  client?.destroy()
  client = null
  currentToken = ''
}

export async function fetchDiscordChannels(): Promise<DiscordChannel[]> {
  if (!client?.isReady()) return []
  const channels: DiscordChannel[] = []
  for (const guild of client.guilds.cache.values()) {
    const guildName = guild.name
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText) continue
      const perms = channel.permissionsFor(client.user!)
      if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) continue
      channels.push({ id: channel.id, name: channel.name, guildId: guild.id, guildName, type: channel.type })
    }
  }
  return channels
}

export async function fetchDiscordMessages(
  channelId: string,
  limit: number,
  beforeId?: string
): Promise<DiscordMessage[]> {
  if (!client?.isReady()) return []
  const channel = await client.channels.fetch(channelId)
  if (!channel || channel.type !== ChannelType.GuildText) return []
  const fetched = await (channel as TextChannel).messages.fetch({ limit, before: beforeId })
  return Array.from(fetched.values()).reverse().map(mapMessage)
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<DiscordMessage> {
  if (!client?.isReady()) throw new Error('Discord client is not connected')
  const channel = await client.channels.fetch(channelId)
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Channel not found or not a text channel')
  const sent = await (channel as TextChannel).send(content)
  return mapMessage(sent)
}
