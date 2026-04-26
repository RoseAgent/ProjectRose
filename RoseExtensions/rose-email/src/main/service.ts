import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { EmailFilters, SpamRule, InjectionPattern } from '../shared/types'

export type { SpamRule, InjectionPattern, EmailFilters }

export type EmailSummary = {
  uid: number
  subject: string
  from: string
  date: string
  read: boolean
}

export type EmailMeta = Record<number, {
  folder: string
  spamClassified: boolean
  injectionDetected?: boolean
  urlhausDetected?: boolean
}>

export type ImapConfig = {
  imapHost: string
  imapPort: number
  imapUser: string
  imapPassword: string
  imapTLS: boolean
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getMetaPath(imapUser: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron')
  const userData = electron.app.getPath('userData')
  return join(userData, `email-meta-${imapUser.replace(/[^a-zA-Z0-9]/g, '_')}.json`)
}

function getFiltersPath(imapUser: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron')
  const userData = electron.app.getPath('userData')
  return join(userData, `email-filters-${imapUser.replace(/[^a-zA-Z0-9]/g, '_')}.json`)
}

// ---------------------------------------------------------------------------
// IMAP client helper
// ---------------------------------------------------------------------------

export async function withImapClient<T>(
  cfg: ImapConfig,
  cb: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapTLS,
    auth: { user: cfg.imapUser, pass: cfg.imapPassword },
    logger: false
  })
  await client.connect()
  try {
    return await cb(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Meta persistence
// ---------------------------------------------------------------------------

export function readEmailMeta(imapUser: string): EmailMeta {
  const path = getMetaPath(imapUser)
  if (!existsSync(path)) return {} as EmailMeta
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as EmailMeta
  } catch {
    return {} as EmailMeta
  }
}

export function writeEmailMeta(imapUser: string, meta: EmailMeta): void {
  writeFileSync(getMetaPath(imapUser), JSON.stringify(meta, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// Filters persistence
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: EmailFilters = {
  spamRules: [],
  injectionPatterns: [],
  customFolders: []
}

export function readEmailFilters(imapUser: string): EmailFilters {
  const path = getFiltersPath(imapUser)
  if (!existsSync(path)) return { ...DEFAULT_FILTERS }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<EmailFilters>
    return {
      spamRules: parsed.spamRules ?? [],
      injectionPatterns: parsed.injectionPatterns ?? [],
      customFolders: parsed.customFolders ?? []
    }
  } catch {
    return { ...DEFAULT_FILTERS }
  }
}

export function writeEmailFilters(imapUser: string, filters: EmailFilters): void {
  writeFileSync(getFiltersPath(imapUser), JSON.stringify(filters, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

export function matchesSpamRule(rule: SpamRule, msg: EmailSummary): boolean {
  if (!rule.enabled) return false
  const fieldMap: Record<string, string> = {
    sender: msg.from,
    subject: msg.subject,
    domain: msg.from
  }
  const value = fieldMap[rule.type] ?? ''
  if (rule.type === 'domain') {
    const domainMatch = msg.from.match(/@([^>@\s]+)/)
    return domainMatch ? domainMatch[1].toLowerCase().includes(rule.value.toLowerCase()) : false
  }
  return value.toLowerCase().includes(rule.value.toLowerCase())
}

export function matchesInjectionPattern(patterns: InjectionPattern[], text: string): boolean {
  return patterns.some(p => {
    if (!p.enabled) return false
    if (p.isRegex) {
      try { return new RegExp(p.pattern, 'i').test(text) } catch { return false }
    }
    return text.toLowerCase().includes(p.pattern.toLowerCase())
  })
}

// ---------------------------------------------------------------------------
// Body fetching
// ---------------------------------------------------------------------------

/**
 * Strip href/src links from text while keeping the readable label.
 * Works on both plain text (URLs) and HTML (anchor tags).
 */
function stripLinks(text: string): string {
  // Remove <a href="...">label</a> → label
  text = text.replace(/<a\b[^>]*href=[^>]*>(.*?)<\/a>/gi, '$1')
  // Remove bare URLs
  text = text.replace(/https?:\/\/\S+/g, '[link removed]')
  return text
}

export async function fetchEmailBody(cfg: ImapConfig, uid: number): Promise<string> {
  return withImapClient(cfg, async (client) => {
    const lock = await client.getMailboxLock('INBOX')
    try {
      let rawBuffer: Buffer | undefined

      for await (const msg of client.fetch(
        String(uid),
        { source: true },
        { uid: true }
      )) {
        if (msg.source) {
          rawBuffer = Buffer.isBuffer(msg.source)
            ? msg.source
            : Buffer.from(msg.source as unknown as ArrayBuffer)
        }
      }

      if (!rawBuffer) return ''

      const parsed = await simpleParser(rawBuffer)
      const text = parsed.text ?? parsed.html ?? ''
      return stripLinks(String(text))
    } finally {
      lock.release()
    }
  })
}
