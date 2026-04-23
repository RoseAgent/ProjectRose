import { readSettings } from '@main/ipc/settingsHandlers'
import {
  withImapClient,
  readEmailFilters,
  readEmailMeta,
  writeEmailMeta,
  matchesSpamRule,
  matchesInjectionPattern,
  fetchEmailBody,
  type EmailSummary
} from '@main/services/emailService'
import type { ExtensionToolEntry } from '@main/extensions/builtinTools'

async function handleListEmails(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const folder = typeof input.folder === 'string' ? input.folder : undefined
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured. Set IMAP credentials in Settings.'
  try {
    const rawMessages = await withImapClient(cfg, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const mbInfo = client.mailbox
        const total = mbInfo ? mbInfo.exists : 0
        if (total === 0) return [] as EmailSummary[]
        const start = Math.max(1, total - 49)
        const messages: EmailSummary[] = []
        for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, uid: true })) {
          messages.push({
            uid: msg.uid,
            subject: msg.envelope?.subject ?? '(no subject)',
            from: msg.envelope?.from?.[0]?.address ?? msg.envelope?.from?.[0]?.name ?? '',
            date: msg.envelope?.date?.toISOString() ?? '',
            read: msg.flags?.has('\\Seen') ?? false
          })
        }
        return messages.reverse()
      } finally {
        lock.release()
      }
    })

    const [filters, meta] = await Promise.all([
      readEmailFilters(cfg.imapUser),
      readEmailMeta(cfg.imapUser)
    ])

    const tagged = rawMessages.map(m => {
      const cached = meta[m.uid]
      let msgFolder = cached?.folder ?? 'inbox'
      if (!cached) {
        const isSpam = filters.spamRules.some(r => matchesSpamRule(r, m))
        const isInjection = matchesInjectionPattern(filters.injectionPatterns, `${m.subject} ${m.from}`)
        if (isSpam) msgFolder = 'spam'
        else if (isInjection) msgFolder = 'quarantine'
      }
      return { ...m, folder: msgFolder }
    })

    const filtered = folder ? tagged.filter(m => m.folder === folder) : tagged
    if (filtered.length === 0) return `No emails found${folder ? ` in ${folder}` : ''}.`

    return filtered.map(m =>
      `[UID:${m.uid}] ${m.read ? '' : '(unread) '}From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nFolder: ${m.folder}`
    ).join('\n\n')
  } catch (err) {
    return `Failed to fetch emails: ${(err as Error).message}`
  }
}

async function handleReadEmail(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const uid = Number(input.uid)
  if (!uid) return 'Missing uid parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured.'
  try {
    const body = await fetchEmailBody(cfg, uid)
    const filters = await readEmailFilters(cfg.imapUser)
    if (matchesInjectionPattern(filters.injectionPatterns, body)) {
      const meta = await readEmailMeta(cfg.imapUser)
      meta[uid] = { ...(meta[uid] ?? { spamClassified: false }), folder: 'quarantine', injectionDetected: true }
      await writeEmailMeta(cfg.imapUser, meta)
      return '[QUARANTINED: Potential prompt injection detected in message body.]'
    }
    return body || '(empty message)'
  } catch (err) {
    return `Failed to read email: ${(err as Error).message}`
  }
}

async function handleMoveEmailToFolder(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const uid = Number(input.uid)
  const folder = String(input.folder || '')
  if (!uid || !folder) return 'Missing uid or folder parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured.'
  const meta = await readEmailMeta(cfg.imapUser)
  meta[uid] = { ...(meta[uid] ?? { spamClassified: false, injectionDetected: false }), folder }
  await writeEmailMeta(cfg.imapUser, meta)
  return `Email ${uid} moved to ${folder}.`
}

async function handleDeleteEmail(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const uid = Number(input.uid)
  if (!uid) return 'Missing uid parameter.'
  const cfg = await readSettings(projectRoot)
  if (!cfg.imapHost || !cfg.imapUser) return 'Email not configured.'
  try {
    await withImapClient(cfg, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        await client.messageDelete(String(uid), { uid: true })
      } finally {
        lock.release()
      }
    })
    const meta = await readEmailMeta(cfg.imapUser)
    delete meta[uid]
    await writeEmailMeta(cfg.imapUser, meta)
    return `Email ${uid} deleted.`
  } catch (err) {
    return `Failed to delete email: ${(err as Error).message}`
  }
}

export const EMAIL_TOOLS: ExtensionToolEntry[] = [
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
