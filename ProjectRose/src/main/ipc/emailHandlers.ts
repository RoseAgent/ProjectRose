import { ipcMain } from 'electron'
import { generateText } from 'ai'
import { IPC } from '../../shared/ipcChannels'
import { readSettings } from './settingsHandlers'
import { resolveModel } from '../services/llmClient'
import {
  withImapClient,
  readEmailFilters,
  writeEmailFilters,
  readEmailMeta,
  writeEmailMeta,
  matchesSpamRule,
  matchesInjectionPattern,
  fetchEmailBody,
  describeImapError,
  DEFAULT_INJECTION_PATTERNS,
  type EmailSummary,
  type EmailFilters,
  type ImapCfg
} from '../services/emailService'

export type { EmailSummary }
export { DEFAULT_INJECTION_PATTERNS }

async function classifySpamBatch(messages: EmailSummary[]): Promise<Record<number, boolean>> {
  if (messages.length === 0) return {}
  try {
    const settings = await readSettings()
    const defaultModel = settings.models.find(m => m.id === settings.defaultModelId) ?? settings.models[0]
    if (!defaultModel) return {}
    const model = resolveModel(defaultModel, settings.providerKeys)
    const lines = messages.map((m, i) => `${i + 1}. From: ${m.from} | Subject: ${m.subject}`).join('\n')
    const { text } = await generateText({
      model,
      messages: [{
        role: 'user' as const,
        content: `Classify each email as spam (1) or not spam (0). Reply with ONLY a JSON array of 0s and 1s in the same order, no other text:\n\n${lines}`
      }]
    })
    const arr = JSON.parse(text.trim()) as number[]
    const result: Record<number, boolean> = {}
    messages.forEach((m, i) => { result[m.uid] = arr[i] === 1 })
    return result
  } catch {
    return {}
  }
}

export function registerEmailHandlers(): void {
  ipcMain.handle(IPC.EMAIL_TEST_CONN, async (): Promise<{ ok: boolean; error?: string }> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return { ok: false, error: 'IMAP host and user are required' }
    try {
      await withImapClient(cfg, async () => {})
      return { ok: true }
    } catch (err) {
      return { ok: false, error: describeImapError(err, cfg as ImapCfg) }
    }
  })

  ipcMain.handle(IPC.EMAIL_FETCH_MESSAGES, async (): Promise<Array<EmailSummary & { folder: string; injectionDetected: boolean }>> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return []
    try {
      const rawMessages = await withImapClient(cfg, async (client) => {
        const lock = await client.getMailboxLock('INBOX')
        try {
          const mbInfo = client.mailbox
          const total = mbInfo ? mbInfo.exists : 0
          if (total === 0) return []
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

      const filters = await readEmailFilters(cfg.imapUser)
      const meta = await readEmailMeta(cfg.imapUser)

      const unclassified: EmailSummary[] = []
      for (const msg of rawMessages) {
        if (meta[msg.uid]) continue
        const isSpam = filters.spamRules.some(r => matchesSpamRule(r, msg))
        const isInjection = matchesInjectionPattern(filters.injectionPatterns, `${msg.subject} ${msg.from}`)
        if (isSpam) {
          meta[msg.uid] = { folder: 'spam', spamClassified: true, injectionDetected: false }
        } else if (isInjection) {
          meta[msg.uid] = { folder: 'quarantine', spamClassified: false, injectionDetected: true }
        } else {
          unclassified.push(msg)
        }
      }

      if (unclassified.length > 0) {
        const spamResults = await classifySpamBatch(unclassified)
        for (const msg of unclassified) {
          const isSpam = spamResults[msg.uid] ?? false
          meta[msg.uid] = { folder: isSpam ? 'spam' : 'inbox', spamClassified: true, injectionDetected: false }
        }
      }

      await writeEmailMeta(cfg.imapUser, meta)

      return rawMessages.map(m => ({
        ...m,
        folder: meta[m.uid]?.folder ?? 'inbox',
        injectionDetected: meta[m.uid]?.injectionDetected ?? false
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.EMAIL_FETCH_MESSAGE, async (_event, uid: number): Promise<string> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return ''
    try {
      const body = await fetchEmailBody(cfg, uid)
      const filters = await readEmailFilters(cfg.imapUser)
      if (matchesInjectionPattern(filters.injectionPatterns, body)) {
        const meta = await readEmailMeta(cfg.imapUser)
        meta[uid] = { ...(meta[uid] ?? { spamClassified: false }), folder: 'quarantine', injectionDetected: true }
        await writeEmailMeta(cfg.imapUser, meta)
        return '[QUARANTINED: Potential prompt injection detected in message body. This message has been moved to Quarantine.]'
      }
      return body
    } catch {
      return ''
    }
  })

  ipcMain.handle(IPC.EMAIL_DELETE_MESSAGE, async (_event, uid: number): Promise<{ ok: boolean; error?: string }> => {
    const cfg = await readSettings()
    if (!cfg.imapHost || !cfg.imapUser) return { ok: false, error: 'Not configured' }
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
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.EMAIL_GET_FILTERS, async (): Promise<EmailFilters> => {
    const cfg = await readSettings()
    return readEmailFilters(cfg.imapUser)
  })

  ipcMain.handle(IPC.EMAIL_SET_FILTERS, async (_event, patch: Partial<EmailFilters>): Promise<EmailFilters> => {
    const cfg = await readSettings()
    const current = await readEmailFilters(cfg.imapUser)
    const updated: EmailFilters = { ...current, ...patch }
    await writeEmailFilters(cfg.imapUser, updated)
    return updated
  })

  ipcMain.handle(IPC.EMAIL_GET_META, async (): Promise<Record<string, unknown>> => {
    const cfg = await readSettings()
    return readEmailMeta(cfg.imapUser)
  })

  ipcMain.handle(IPC.EMAIL_SET_MSG_FOLDER, async (_event, uid: number, folder: string): Promise<void> => {
    const cfg = await readSettings()
    const meta = await readEmailMeta(cfg.imapUser)
    meta[uid] = { ...(meta[uid] ?? { spamClassified: false, injectionDetected: false }), folder }
    await writeEmailMeta(cfg.imapUser, meta)
  })
}
