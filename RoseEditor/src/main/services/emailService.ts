import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
export interface EmailSummary {
  uid: number
  subject: string
  from: string
  date: string
  read: boolean
}

export interface SpamRule {
  id: string
  type: 'sender' | 'domain' | 'subject'
  value: string
  enabled: boolean
}

export interface InjectionPattern {
  id: string
  pattern: string
  isRegex: boolean
  enabled: boolean
  builtin: boolean
}

export interface EmailFilters {
  spamRules: SpamRule[]
  injectionPatterns: InjectionPattern[]
  customFolders: Array<{ id: string; name: string }>
}

export interface EmailMessageMeta {
  folder: string
  spamClassified: boolean
  injectionDetected: boolean
}

export interface ImapCfg {
  imapHost: string
  imapPort: number
  imapUser: string
  imapPassword: string
  imapTLS: boolean
}

export const DEFAULT_INJECTION_PATTERNS: InjectionPattern[] = [
  { id: 'bi-1', pattern: 'ignore previous instructions', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-2', pattern: 'disregard all previous', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-3', pattern: 'you are now', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-4', pattern: 'SYSTEM:', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-5', pattern: 'forget your instructions', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-6', pattern: 'act as if', isRegex: false, enabled: true, builtin: true },
  { id: 'bi-7', pattern: 'DAN mode', isRegex: false, enabled: true, builtin: true },
]

function accountKey(imapUser: string): string {
  return imapUser.replace(/[^a-zA-Z0-9@._-]/g, '_')
}

export function makeImapClient(cfg: ImapCfg): ImapFlow {
  return new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapTLS,
    auth: { user: cfg.imapUser, pass: cfg.imapPassword },
    logger: false
  })
}

export async function withImapClient<T>(cfg: ImapCfg, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = makeImapClient(cfg)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function readEmailFilters(imapUser: string): Promise<EmailFilters> {
  const p = join(app.getPath('userData'), `email-filters-${accountKey(imapUser)}.json`)
  try {
    const stored = JSON.parse(await readFile(p, 'utf-8')) as Partial<EmailFilters>
    const storedBuiltins = new Map((stored.injectionPatterns ?? []).filter(ip => ip.builtin).map(ip => [ip.id, ip]))
    const mergedBuiltins = DEFAULT_INJECTION_PATTERNS.map(bp => storedBuiltins.get(bp.id) ?? bp)
    const userPatterns = (stored.injectionPatterns ?? []).filter(ip => !ip.builtin)
    return {
      spamRules: stored.spamRules ?? [],
      injectionPatterns: [...mergedBuiltins, ...userPatterns],
      customFolders: stored.customFolders ?? []
    }
  } catch {
    return { spamRules: [], injectionPatterns: [...DEFAULT_INJECTION_PATTERNS], customFolders: [] }
  }
}

export async function writeEmailFilters(imapUser: string, filters: EmailFilters): Promise<void> {
  const p = join(app.getPath('userData'), `email-filters-${accountKey(imapUser)}.json`)
  await writeFile(p, JSON.stringify(filters, null, 2))
}

export async function readEmailMeta(imapUser: string): Promise<Record<string, EmailMessageMeta>> {
  const p = join(app.getPath('userData'), `email-meta-${accountKey(imapUser)}.json`)
  try { return JSON.parse(await readFile(p, 'utf-8')) as Record<string, EmailMessageMeta> }
  catch { return {} }
}

export async function writeEmailMeta(imapUser: string, meta: Record<string, EmailMessageMeta>): Promise<void> {
  const p = join(app.getPath('userData'), `email-meta-${accountKey(imapUser)}.json`)
  await writeFile(p, JSON.stringify(meta, null, 2))
}

export function matchesSpamRule(rule: SpamRule, msg: EmailSummary): boolean {
  if (!rule.enabled) return false
  const v = rule.value.toLowerCase()
  switch (rule.type) {
    case 'sender': return msg.from.toLowerCase().includes(v)
    case 'domain': return msg.from.toLowerCase().includes('@' + v)
    case 'subject': return msg.subject.toLowerCase().includes(v)
  }
}

export function matchesInjectionPattern(patterns: InjectionPattern[], text: string): boolean {
  return patterns.some(p => {
    if (!p.enabled) return false
    try {
      if (p.isRegex) return new RegExp(p.pattern, 'i').test(text)
    } catch { return false }
    return text.toLowerCase().includes(p.pattern.toLowerCase())
  })
}

export function removeEmailLinks(text: string): string {
  return text
    .replace(/https?:\/\/[^\s\])"'>]+/g, '')
    .replace(/www\.[^\s\])"'>]+/g, '')
    .replace(/[ \t]*\n[ \t]*\n[ \t]*\n/g, '\n\n')
    .trim()
}

export async function fetchEmailBody(cfg: ImapCfg, uid: number): Promise<string> {
  const raw = await withImapClient(cfg, async (client) => {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const { content } = await client.download(String(uid), undefined, { uid: true })
      const parsed = await simpleParser(content)
      return parsed.text ?? ''
    } finally {
      lock.release()
    }
  })
  return removeEmailLinks(raw)
}

export function describeImapError(err: unknown, cfg: ImapCfg): string {
  if (!(err instanceof Error)) return String(err)
  const e = err as Error & {
    code?: string
    hostname?: string
    responseText?: string
    authenticationFailed?: boolean
  }
  if (e.code === 'ENOTFOUND') return `Host not found: "${e.hostname ?? cfg.imapHost}" — check your IMAP server address`
  if (e.code === 'ECONNREFUSED') return `Connection refused on port ${cfg.imapPort} — check the port number and that the server is reachable`
  if (e.code === 'ETIMEDOUT' || e.code === 'ESOCKETTIMEDOUT') return `Connection timed out — server is unreachable or port ${cfg.imapPort} is blocked by a firewall`
  if (e.code === 'ECONNRESET') return `Connection was reset by the server — try enabling TLS or switching ports`
  if (e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'CERT_HAS_EXPIRED') return `TLS certificate error (${e.code}) — try disabling TLS or use port 143`
  if (e.authenticationFailed) {
    const detail = e.responseText ? ` — server said: ${e.responseText}` : ''
    return `Authentication failed${detail}`
  }
  const parts: string[] = [e.message]
  if (e.responseText && e.responseText !== e.message) parts.push(e.responseText)
  return parts.join(' — ')
}
