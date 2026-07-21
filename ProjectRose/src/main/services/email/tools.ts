// Agent tool handlers for the rose-email built-in. Same signature as
// contacts/tools.ts — (input, ...) => Promise<string> — so they can be wrapped
// by `wrapExecute` and registered in `buildCoreTools` in llmClient.ts.
//
// Off-by-default destructive tools (send / reply / forward) are declared in
// projectSettingsService's BUILTIN_EXTENSION_TOOLS with `defaultDisabled:
// true`; the toolRegistry filters them out of the LLM's catalog until the
// user toggles them on in Settings → Tools.

import {
  archiveMessage,
  createDraft,
  deleteMessage,
  forward as emailForward,
  getMessage,
  labelMessage,
  listFolders,
  listMessages,
  markRead,
  moveMessage,
  reply as emailReply,
  search as emailSearch,
  sendMessage
} from './emailService'

import type { EmailAddress, EmailMessage, EmailMessageSummary } from '../../../shared/email'

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback?: number): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return fallback
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function asAddressList(v: unknown): EmailAddress[] {
  if (!Array.isArray(v)) return []
  const out: EmailAddress[] = []
  for (const item of v) {
    if (typeof item === 'string') {
      out.push({ address: item })
    } else if (item && typeof item === 'object' && typeof (item as { address?: unknown }).address === 'string') {
      const obj = item as { address: string; name?: unknown }
      out.push({ address: obj.address, name: typeof obj.name === 'string' ? obj.name : undefined })
    }
  }
  return out
}

function summaryLine(m: EmailMessageSummary): string {
  const from = m.from?.address ?? '(unknown sender)'
  const subject = m.subject || '(no subject)'
  const flag = m.read ? '' : ' [unread]'
  return `${m.id}\t${new Date(m.date).toISOString()}\t${from}\t${subject}${flag}`
}

function formatMessage(m: EmailMessage): string {
  const lines: string[] = []
  lines.push(`From: ${m.from?.address ?? ''}${m.from?.name ? ` (${m.from.name})` : ''}`)
  if (m.to.length) lines.push(`To: ${m.to.map((a) => a.address).join(', ')}`)
  if (m.cc.length) lines.push(`Cc: ${m.cc.map((a) => a.address).join(', ')}`)
  lines.push(`Subject: ${m.subject}`)
  lines.push(`Date: ${new Date(m.date).toISOString()}`)
  lines.push(`Id: ${m.id}`)
  lines.push('')
  lines.push(m.body)
  return lines.join('\n')
}

// ── Read ────────────────────────────────────────────────────────────────

export async function handleEmailListMessages(input: Record<string, unknown>): Promise<string> {
  const folder = asString(input.folder) || undefined
  const limit = asNumber(input.limit)
  const query = asString(input.query) || undefined
  const summaries = await listMessages({ folder, limit, query })
  if (summaries.length === 0) return 'No messages.'
  return summaries.map(summaryLine).join('\n')
}

export async function handleEmailSearch(input: Record<string, unknown>): Promise<string> {
  const query = asString(input.query)
  if (!query) return 'Missing `query`.'
  const folder = asString(input.folder) || undefined
  const limit = asNumber(input.limit)
  const summaries = await emailSearch({ query, folder, limit })
  if (summaries.length === 0) return 'No matches.'
  return summaries.map(summaryLine).join('\n')
}

export async function handleEmailGetMessage(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  if (!messageId) return 'Missing `messageId`.'
  const msg = await getMessage(messageId)
  return formatMessage(msg)
}

export async function handleEmailListFolders(): Promise<string> {
  const folders = await listFolders()
  if (folders.length === 0) return 'No folders.'
  return folders.map((f) => `${f.id}\t${f.name}`).join('\n')
}

// ── Compose ─────────────────────────────────────────────────────────────

export async function handleEmailDraftMessage(input: Record<string, unknown>): Promise<string> {
  const to = asAddressList(input.to)
  const subject = asString(input.subject)
  const body = asString(input.body)
  if (to.length === 0 || !subject || !body) return 'Missing `to`, `subject`, or `body`.'
  const cc = asAddressList(input.cc)
  const bcc = asAddressList(input.bcc)
  const inReplyTo = asString(input.inReplyTo) || undefined
  const res = await createDraft({ to, cc, bcc, subject, body, inReplyTo })
  return `Draft created: ${res.draftId}`
}

export async function handleEmailSendMessage(input: Record<string, unknown>): Promise<string> {
  const to = asAddressList(input.to)
  const subject = asString(input.subject)
  const body = asString(input.body)
  if (to.length === 0 || !subject || !body) return 'Missing `to`, `subject`, or `body`.'
  const cc = asAddressList(input.cc)
  const bcc = asAddressList(input.bcc)
  const draftId = asString(input.draftId) || undefined
  const res = await sendMessage({ to, cc, bcc, subject, body, draftId })
  return `Sent: ${res.messageId}`
}

export async function handleEmailReply(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  const body = asString(input.body)
  if (!messageId || !body) return 'Missing `messageId` or `body`.'
  const replyAll = asBool(input.replyAll)
  const res = await emailReply({ messageId, body, replyAll })
  return `Replied: ${res.messageId}`
}

export async function handleEmailForward(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  const to = asAddressList(input.to)
  if (!messageId || to.length === 0) return 'Missing `messageId` or `to`.'
  const body = asString(input.body) || undefined
  const res = await emailForward({ messageId, to, body })
  return `Forwarded: ${res.messageId}`
}

// ── Triage ──────────────────────────────────────────────────────────────

export async function handleEmailMarkRead(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  if (!messageId) return 'Missing `messageId`.'
  const read = asBool(input.read, true)
  await markRead(messageId, read)
  return `Marked ${read ? 'read' : 'unread'}: ${messageId}`
}

export async function handleEmailArchive(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  if (!messageId) return 'Missing `messageId`.'
  await archiveMessage(messageId)
  return `Archived: ${messageId}`
}

export async function handleEmailMove(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  const folder = asString(input.folder)
  if (!messageId || !folder) return 'Missing `messageId` or `folder`.'
  await moveMessage(messageId, folder)
  return `Moved ${messageId} to ${folder}`
}

export async function handleEmailLabel(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  const label = asString(input.label)
  if (!messageId || !label) return 'Missing `messageId` or `label`.'
  const add = asBool(input.add, true)
  await labelMessage(messageId, label, add)
  return `${add ? 'Added' : 'Removed'} label "${label}" on ${messageId}`
}

export async function handleEmailDelete(input: Record<string, unknown>): Promise<string> {
  const messageId = asString(input.messageId)
  if (!messageId) return 'Missing `messageId`.'
  await deleteMessage(messageId)
  return `Moved to Trash: ${messageId}`
}

