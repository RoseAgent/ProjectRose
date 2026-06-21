import type { ExtensionManifest } from '@shared/extension-types'

// Renderer-side manifest for rose-channels. The main-process side
// (`src/main/extensions/builtins/rose-channels/manifest.ts`) declares an
// identical manifest — they must match because they are the two halves of
// the same built-in. See ADR 0015 for the design.
export const manifest: ExtensionManifest = {
  id: 'rose-channels',
  name: 'Channels',
  version: '0.1.0',
  description:
    'React to incoming Discord, Slack, and email messages with user-defined prompts. Each Channel Rule fires the Agent through a Detached Run with its own tool allowlist.',
  author: 'ProjectRose',
  latin: 'Nuntii',
  navItem: { label: 'Channels', iconName: 'broadcast' },
  provides: {
    pageView: true,
    main: true,
    detachedRunWithTools: true,
    agentTools: true,
    notifyStatus: true,
    broadcast: true,
    tools: [
      {
        name: 'channels_send_discord',
        displayName: 'Send Discord message',
        description: 'Post a message to a Discord channel by id.'
      },
      {
        name: 'channels_reply_discord',
        displayName: 'Reply on Discord',
        description: 'Reply to a specific Discord message id.'
      },
      {
        name: 'channels_send_slack',
        displayName: 'Send Slack message',
        description: 'Post a message to a Slack channel by id.'
      },
      {
        name: 'channels_reply_slack',
        displayName: 'Reply on Slack',
        description: 'Reply in-thread to a Slack message.'
      },
      {
        name: 'channels_list_rules',
        displayName: 'List channel rules',
        description: 'Read-only: list the Channel Rules configured in this workspace.'
      },

      // Discord read tools (default-on — needed to gather context before responding).
      {
        name: 'channels_discord_history',
        displayName: 'Read Discord channel history',
        description:
          'Read the most recent messages in a Discord channel (paginate backwards with beforeMessageId).'
      },
      {
        name: 'channels_discord_user',
        displayName: 'Look up Discord user',
        description: 'Fetch a Discord user by id — tag, display name, bot flag.'
      },

      {
        name: 'channels_discord_react',
        displayName: 'React on Discord',
        description: 'Add an emoji reaction to a Discord message.'
      },

      // Slack read tools.
      {
        name: 'channels_slack_history',
        displayName: 'Read Slack channel history',
        description:
          'Read the most recent messages in a Slack channel or thread (use threadTs for a specific thread).'
      },
      {
        name: 'channels_slack_user',
        displayName: 'Look up Slack user',
        description: 'Fetch a Slack user by id — name, real name, bot flag.'
      },

      {
        name: 'channels_slack_react',
        displayName: 'React on Slack',
        description: 'Add an emoji reaction to a Slack message.'
      }
    ]
  }
}
