// Agent-callable tools rose-channels registers via ctx.registerTools().
//
// All Discord and Slack tools (send, reply, react) ship default-enabled —
// chat-platform sends are considered non-destructive (messages can be
// edited or deleted). They still respect a Channel Rule's `tools:`
// allowlist, so a rule that doesn't list them can't fire them.
// Email send/reply (in rose-email) keeps its existing default-off
// behaviour per ADR 0011 — that decision is unchanged.

import type { ExtensionToolEntry } from '@shared/extension-types'
import { listRules } from './channelRuleStore'
import type { RuntimeBundle } from './main'

export function buildChannelsTools(runtime: RuntimeBundle): ExtensionToolEntry[] {
  return [
    {
      name: 'channels_send_discord',
      description:
        'Post a new message to a Discord channel by channel id. Returns the new message id.',
      schema: {
        type: 'object',
        required: ['channelId', 'content'],
        properties: {
          channelId: { type: 'string', description: 'Discord channel snowflake id.' },
          content: { type: 'string', description: 'Message text to post.' }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, content } = input as { channelId: string; content: string }
        if (!runtime.discord) throw new Error('Discord is not connected.')
        const result = await runtime.discord.sendMessage(channelId, content)
        return JSON.stringify(result)
      }
    },
    {
      name: 'channels_reply_discord',
      description: 'Reply to a specific Discord message by id. Returns the new message id.',
      schema: {
        type: 'object',
        required: ['channelId', 'messageId', 'content'],
        properties: {
          channelId: { type: 'string', description: 'Discord channel snowflake id.' },
          messageId: { type: 'string', description: 'Discord message id to reply to.' },
          content: { type: 'string', description: 'Reply text.' }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, messageId, content } = input as {
          channelId: string
          messageId: string
          content: string
        }
        if (!runtime.discord) throw new Error('Discord is not connected.')
        const result = await runtime.discord.replyTo(messageId, channelId, content)
        return JSON.stringify(result)
      }
    },
    {
      name: 'channels_send_slack',
      description: 'Post a new message to a Slack channel by channel id.',
      schema: {
        type: 'object',
        required: ['channelId', 'content'],
        properties: {
          channelId: { type: 'string', description: 'Slack channel id (Cxxxx or Dxxxx).' },
          content: { type: 'string', description: 'Message text to post.' }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, content } = input as { channelId: string; content: string }
        if (!runtime.slack) throw new Error('Slack is not connected.')
        const result = await runtime.slack.sendMessage(channelId, content)
        return JSON.stringify(result)
      }
    },
    {
      name: 'channels_reply_slack',
      description:
        "Reply in-thread to a Slack message. `messageId` is the parent message's `ts`.",
      schema: {
        type: 'object',
        required: ['channelId', 'messageId', 'content'],
        properties: {
          channelId: { type: 'string', description: 'Slack channel id.' },
          messageId: { type: 'string', description: "Parent message ts (e.g. '1716638800.000100')." },
          content: { type: 'string', description: 'Reply text.' }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, messageId, content } = input as {
          channelId: string
          messageId: string
          content: string
        }
        if (!runtime.slack) throw new Error('Slack is not connected.')
        const result = await runtime.slack.replyToThread(channelId, messageId, content)
        return JSON.stringify(result)
      }
    },
    {
      name: 'channels_list_rules',
      description:
        'List the Channel Rules configured in the current workspace. Read-only.',
      schema: { type: 'object', properties: {} },
      execute: async (_input, projectRoot): Promise<string> => {
        const rules = await listRules(projectRoot)
        return JSON.stringify(
          rules.map(({ slug, rule }) => ({
            slug,
            name: rule.name,
            enabled: rule.enabled,
            source: rule.source,
            identifier: rule.identifier,
            identifierDisplay: rule.identifierDisplay,
            tools: rule.tools
          }))
        )
      }
    },

    // ── Discord read tools ──
    {
      name: 'channels_discord_history',
      description:
        'Read the most recent messages in a Discord channel (chronological order). ' +
        '`limit` is clamped to [1, 100]. Use `beforeMessageId` to page backwards.',
      schema: {
        type: 'object',
        required: ['channelId'],
        properties: {
          channelId: { type: 'string', description: 'Discord channel snowflake id.' },
          limit: { type: 'number', description: 'How many messages to fetch (default 20, max 100).' },
          beforeMessageId: {
            type: 'string',
            description: 'When supplied, returns messages older than this id.'
          }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, limit, beforeMessageId } = input as {
          channelId: string
          limit?: number
          beforeMessageId?: string
        }
        if (!runtime.discord) throw new Error('Discord is not connected.')
        const messages = await runtime.discord.fetchHistory(
          channelId,
          typeof limit === 'number' ? limit : 20,
          beforeMessageId
        )
        return JSON.stringify(messages)
      }
    },
    {
      name: 'channels_discord_user',
      description: 'Fetch a Discord user by id. Returns id, tag, displayName, bot.',
      schema: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'Discord user snowflake id.' }
        }
      },
      execute: async (input): Promise<string> => {
        const { userId } = input as { userId: string }
        if (!runtime.discord) throw new Error('Discord is not connected.')
        const user = await runtime.discord.fetchUser(userId)
        return JSON.stringify(user)
      }
    },

    // ── Discord write tool (destructive — default-off) ──
    {
      name: 'channels_discord_react',
      description:
        'Add an emoji reaction to a Discord message. Pass a unicode emoji (`👍`) or a custom-emoji identifier (`name:id`).',
      schema: {
        type: 'object',
        required: ['channelId', 'messageId', 'emoji'],
        properties: {
          channelId: { type: 'string', description: 'Discord channel snowflake id.' },
          messageId: { type: 'string', description: 'Message id to react to.' },
          emoji: { type: 'string', description: 'Unicode emoji glyph or `name:id` for custom emoji.' }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, messageId, emoji } = input as {
          channelId: string
          messageId: string
          emoji: string
        }
        if (!runtime.discord) throw new Error('Discord is not connected.')
        await runtime.discord.addReaction(channelId, messageId, emoji)
        return 'ok'
      }
    },

    // ── Slack read tools ──
    {
      name: 'channels_slack_history',
      description:
        'Read the most recent messages in a Slack channel (chronological order). ' +
        '`limit` is clamped to [1, 100]. When `threadTs` is supplied, returns that ' +
        "thread's replies instead of the channel's top-level messages.",
      schema: {
        type: 'object',
        required: ['channelId'],
        properties: {
          channelId: { type: 'string', description: 'Slack channel id (Cxxxx or Dxxxx).' },
          limit: { type: 'number', description: 'How many messages to fetch (default 20, max 100).' },
          threadTs: { type: 'string', description: "Parent message ts to read a thread instead." }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, limit, threadTs } = input as {
          channelId: string
          limit?: number
          threadTs?: string
        }
        if (!runtime.slack) throw new Error('Slack is not connected.')
        const messages = await runtime.slack.fetchHistory(
          channelId,
          typeof limit === 'number' ? limit : 20,
          threadTs
        )
        return JSON.stringify(messages)
      }
    },
    {
      name: 'channels_slack_user',
      description: 'Fetch a Slack user by id. Returns id, name, realName, isBot.',
      schema: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'Slack user id (Uxxxx).' }
        }
      },
      execute: async (input): Promise<string> => {
        const { userId } = input as { userId: string }
        if (!runtime.slack) throw new Error('Slack is not connected.')
        const user = await runtime.slack.fetchUser(userId)
        return JSON.stringify(user)
      }
    },

    // ── Slack write tool (destructive — default-off) ──
    {
      name: 'channels_slack_react',
      description:
        'Add an emoji reaction to a Slack message. `emoji` is the reaction name (e.g. `thumbsup`, no colons).',
      schema: {
        type: 'object',
        required: ['channelId', 'messageId', 'emoji'],
        properties: {
          channelId: { type: 'string', description: 'Slack channel id.' },
          messageId: { type: 'string', description: "Message ts (e.g. '1716638800.000100')." },
          emoji: { type: 'string', description: "Reaction name without colons (e.g. 'thumbsup')." }
        }
      },
      execute: async (input): Promise<string> => {
        const { channelId, messageId, emoji } = input as {
          channelId: string
          messageId: string
          emoji: string
        }
        if (!runtime.slack) throw new Error('Slack is not connected.')
        await runtime.slack.addReaction(channelId, messageId, emoji)
        return 'ok'
      }
    }
  ]
}
