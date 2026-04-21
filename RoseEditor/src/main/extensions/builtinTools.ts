import {
  handleListEmails,
  handleReadEmail,
  handleMoveEmailToFolder,
  handleDeleteEmail,
  handleListDiscordChannels,
  handleReadDiscordMessages,
  handleSendDiscordMessage
} from '../services/toolHandlers'

export interface ExtensionToolEntry {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}

export interface MainExtensionEntry {
  id: string
  tools: ExtensionToolEntry[]
}

export const BUILTIN_EXTENSION_TOOLS: MainExtensionEntry[] = [
  {
    id: 'rose-email',
    tools: [
      {
        name: 'list_emails',
        description: 'List emails from the configured inbox. Returns summaries with UIDs, senders, subjects, dates, and folder classification (inbox/spam/quarantine). Use the uid from results to read or delete a specific email.',
        schema: {
          type: 'object',
          properties: {
            folder: { type: 'string', enum: ['inbox', 'spam', 'quarantine'], description: 'Filter by folder. Omit to list all emails.' }
          }
        },
        execute: handleListEmails
      },
      {
        name: 'read_email',
        description: 'Read the full sanitized body of an email by UID. Links are stripped for safety. Returns a quarantine notice if prompt injection is detected in the body.',
        schema: {
          type: 'object',
          properties: {
            uid: { type: 'number', description: 'The email UID from list_emails' }
          },
          required: ['uid']
        },
        execute: handleReadEmail
      },
      {
        name: 'move_email_to_folder',
        description: 'Move an email to a folder to categorize it. Folders: inbox, spam, quarantine.',
        schema: {
          type: 'object',
          properties: {
            uid: { type: 'number', description: 'The email UID' },
            folder: { type: 'string', enum: ['inbox', 'spam', 'quarantine'], description: 'Target folder' }
          },
          required: ['uid', 'folder']
        },
        execute: handleMoveEmailToFolder
      },
      {
        name: 'delete_email',
        description: 'Permanently delete an email by UID from the IMAP inbox.',
        schema: {
          type: 'object',
          properties: {
            uid: { type: 'number', description: 'The email UID to delete' }
          },
          required: ['uid']
        },
        execute: handleDeleteEmail
      }
    ]
  },
  {
    id: 'rose-discord',
    tools: [
      {
        name: 'list_discord_channels',
        description: 'List all Discord channels the bot has access to, grouped by server. Returns channel names and IDs needed for reading or sending messages.',
        schema: {
          type: 'object',
          properties: {}
        },
        execute: handleListDiscordChannels
      },
      {
        name: 'read_discord_messages',
        description: 'Read recent messages from a Discord channel. Returns messages with author, timestamp, and content.',
        schema: {
          type: 'object',
          properties: {
            channelId: { type: 'string', description: 'The Discord channel ID' },
            limit: { type: 'number', description: 'Number of messages to fetch (default 20, max 100)' }
          },
          required: ['channelId']
        },
        execute: handleReadDiscordMessages
      },
      {
        name: 'send_discord_message',
        description: 'Send a message to a Discord channel.',
        schema: {
          type: 'object',
          properties: {
            channelId: { type: 'string', description: 'The Discord channel ID' },
            content: { type: 'string', description: 'The message text to send' }
          },
          required: ['channelId', 'content']
        },
        execute: handleSendDiscordMessage
      }
    ]
  }
]

export function getExtensionToolsById(extensionId: string): ExtensionToolEntry[] {
  return BUILTIN_EXTENSION_TOOLS.find((e) => e.id === extensionId)?.tools ?? []
}

export function getAllBuiltinExtensionTools(): ExtensionToolEntry[] {
  return BUILTIN_EXTENSION_TOOLS.flatMap((e) => e.tools)
}
