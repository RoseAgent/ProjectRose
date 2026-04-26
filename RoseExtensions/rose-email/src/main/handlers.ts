import { ipcMain } from 'electron'
import * as email from './service'
import * as urlhaus from './urlhaus'
import type { ExtensionMainContext } from './types'
import type { EmailFilters } from '../shared/types'

export function registerHandlers(ctx: ExtensionMainContext): () => void {
  // rose-email:fetchMessages
  ipcMain.handle('rose-email:fetchMessages', async () => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapHost || !cfg.imapUser) return []

    const rawMessages = await email.withImapClient(cfg, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const mbInfo = client.mailbox
        const total = mbInfo ? (mbInfo as { exists: number }).exists : 0
        if (total === 0) return [] as email.EmailSummary[]
        const start = Math.max(1, total - 49)
        const messages: email.EmailSummary[] = []
        for await (const msg of client.fetch(`${start}:*`, {
          envelope: true, flags: true, uid: true
        })) {
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

    urlhaus.ensureUrlhausLoaded()
    const filters = email.readEmailFilters(cfg.imapUser)
    const meta = email.readEmailMeta(cfg.imapUser)

    return rawMessages.map(m => {
      const cached = meta[m.uid]
      let folder = cached?.folder ?? 'inbox'
      let injectionDetected = cached?.injectionDetected ?? false
      let urlhausDetected = cached?.urlhausDetected ?? false
      if (!cached) {
        const isSpam = filters.spamRules.some(r => email.matchesSpamRule(r, m))
        const isInjection = email.matchesInjectionPattern(
          filters.injectionPatterns,
          `${m.subject} ${m.from}`
        )
        const senderDomain = m.from.match(/@([^>@\s]+)/)?.[1] ?? ''
        const isUrlhaus = senderDomain ? urlhaus.isBlockedByUrlhaus(senderDomain) : false
        if (isSpam) folder = 'spam'
        else if (isUrlhaus) { folder = 'spam'; urlhausDetected = true }
        else if (isInjection) { folder = 'quarantine'; injectionDetected = true }
      }
      return { ...m, folder, injectionDetected, urlhausDetected }
    })
  })

  // rose-email:fetchBody
  ipcMain.handle('rose-email:fetchBody', async (_event, uid: number) => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapHost || !cfg.imapUser) return { body: '' }

    const filters = email.readEmailFilters(cfg.imapUser)
    const body = await email.fetchEmailBody(cfg, uid)

    if (email.matchesInjectionPattern(filters.injectionPatterns, body)) {
      const meta = email.readEmailMeta(cfg.imapUser)
      meta[uid] = {
        ...(meta[uid] ?? { spamClassified: false }),
        folder: 'quarantine',
        injectionDetected: true
      }
      email.writeEmailMeta(cfg.imapUser, meta)
      return { body: '[QUARANTINED: Potential prompt injection detected in message body.]' }
    }

    return { body: body || '(empty message)' }
  })

  // rose-email:deleteMessage
  ipcMain.handle('rose-email:deleteMessage', async (_event, uid: number) => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapHost || !cfg.imapUser) return

    await email.withImapClient(cfg, async (client) => {
      const lock = await client.getMailboxLock('INBOX')
      try {
        await client.messageDelete(String(uid), { uid: true })
      } finally {
        lock.release()
      }
    })

    const meta = email.readEmailMeta(cfg.imapUser)
    delete meta[uid]
    email.writeEmailMeta(cfg.imapUser, meta)
  })

  // rose-email:setMessageFolder
  ipcMain.handle('rose-email:setMessageFolder', async (_event, uid: number, folder: string) => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapUser) return

    const meta = email.readEmailMeta(cfg.imapUser)
    meta[uid] = {
      ...(meta[uid] ?? { spamClassified: false }),
      folder
    }
    email.writeEmailMeta(cfg.imapUser, meta)
  })

  // rose-email:loadFilters
  ipcMain.handle('rose-email:loadFilters', async () => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapUser) return { spamRules: [], injectionPatterns: [], customFolders: [] }
    return email.readEmailFilters(cfg.imapUser)
  })

  // rose-email:saveFilters
  ipcMain.handle('rose-email:saveFilters', async (_event, patch: Partial<EmailFilters>) => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapUser) return patch

    const existing = email.readEmailFilters(cfg.imapUser)
    const updated: EmailFilters = { ...existing, ...patch }
    email.writeEmailFilters(cfg.imapUser, updated)
    return updated
  })

  // rose-email:getUrlhausStatus
  ipcMain.handle('rose-email:getUrlhausStatus', () => urlhaus.getUrlhausStatus())

  // rose-email:refreshUrlhaus
  ipcMain.handle('rose-email:refreshUrlhaus', async () => urlhaus.refreshUrlhaus())

  // rose-email:testConnection
  ipcMain.handle('rose-email:testConnection', async () => {
    const settings = await ctx.getSettings()
    const cfg = settings as unknown as email.ImapConfig
    if (!cfg.imapHost || !cfg.imapUser) return { ok: false, error: 'IMAP not configured' }
    try {
      await email.withImapClient(cfg, async (client) => {
        await client.getMailboxLock('INBOX').then(lock => lock.release())
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Return cleanup function
  return () => {
    ipcMain.removeHandler('rose-email:fetchMessages')
    ipcMain.removeHandler('rose-email:fetchBody')
    ipcMain.removeHandler('rose-email:deleteMessage')
    ipcMain.removeHandler('rose-email:setMessageFolder')
    ipcMain.removeHandler('rose-email:loadFilters')
    ipcMain.removeHandler('rose-email:saveFilters')
    ipcMain.removeHandler('rose-email:getUrlhausStatus')
    ipcMain.removeHandler('rose-email:refreshUrlhaus')
    ipcMain.removeHandler('rose-email:testConnection')
  }
}
