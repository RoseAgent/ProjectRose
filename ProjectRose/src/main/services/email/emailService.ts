// Public facade for the rose-email built-in. IPC handlers and the agent
// tool handlers both call into this module — they don't reach into the
// transports directly.

import type {
  DraftMessageArgs,
  EmailAccount,
  EmailFolder,
  EmailMessage,
  EmailMessageSummary,
  EmailStatus,
  ForwardArgs,
  ListMessagesArgs,
  ReplyArgs,
  SaveImapTransportArgs,
  SearchArgs,
  SendMessageArgs
} from '../../../shared/email'

import { applySettingsPatch, readSettings } from '../settingsService'
import { buildAuthedClient, googleAuthGetStatus } from '../google/googleAuth'
import { google } from 'googleapis'
import { callGmail } from './gmailTransport'

import { getActiveTransport } from './emailTransport'
import {
  clearImapPasswords,
  hasImapPasswords,
  writeImapPasswords
} from './imapCredentialsStore'
import { startEmailSyncLoop } from './emailSyncLoop'

// Re-export the events emitter so other built-ins can subscribe via the
// stable `emailService` facade (rose-channels does this). See ADR 0011
// amendment 2026-05-25.
export { emailEvents } from './emailSyncLoop'

// ── Status / configuration ──────────────────────────────────────────────

export async function getEmailStatus(): Promise<EmailStatus> {
  const s = await readSettings()
  const email = s.email
  const auth = await googleAuthGetStatus()

  let ready = false
  if (email.transport === 'imap') {
    ready = (await hasImapPasswords()) && !!email.imap && !!email.smtp
  } else if (email.transport === 'google') {
    ready = auth.signedIn
  }

  return {
    transport: email.transport,
    account: email.account,
    ready,
    googleSignedIn: auth.signedIn,
    lastSyncAt: email.lastSyncAt
  }
}

async function patchEmailSettings(patch: Partial<typeof import('../../../shared/email').DEFAULT_EMAIL_SETTINGS>): Promise<void> {
  const s = await readSettings()
  await applySettingsPatch({ email: { ...s.email, ...patch } })
}

export async function saveImapTransport(args: SaveImapTransportArgs): Promise<EmailStatus> {
  await writeImapPasswords({
    imapPassword: args.imapPassword,
    smtpPassword: args.smtpPassword
  })
  await patchEmailSettings({
    transport: 'imap',
    account: args.account,
    imap: args.imap,
    smtp: args.smtp
  })
  // Kick the sync loop so the new transport's first poll happens immediately
  // instead of waiting for the periodic tick. Idempotent if already running.
  startEmailSyncLoop()
  return getEmailStatus()
}

/**
 * Switch to (or refresh) the Google transport. Verifies the current refresh
 * token covers the Gmail scope AND that the user's Google Cloud project has
 * the Gmail API enabled by making a lightweight `users.getProfile` call.
 * Any failure here is translated by `callGmail` into a `[email:<category>]`
 * tagged message the renderer recognizes.
 */
export async function activateGoogleTransport(): Promise<EmailStatus> {
  const auth = await googleAuthGetStatus()
  if (!auth.signedIn) {
    throw new Error('Sign in to Google before activating the Google email transport.')
  }
  await assertGmailReady()
  await patchEmailSettings({
    transport: 'google',
    account: { address: auth.accountEmail, displayName: null },
    imap: null,
    smtp: null
  })
  await clearImapPasswords()
  startEmailSyncLoop()
  return getEmailStatus()
}

async function assertGmailReady(): Promise<void> {
  const client = await buildAuthedClient()
  if (!client) throw new Error('Not signed in to Google.')
  const gmail = google.gmail({ version: 'v1', auth: client })
  await callGmail(() => gmail.users.getProfile({ userId: 'me' }))
}

/**
 * Clear the active transport. Wipes the inactive-side credentials (IMAP
 * passwords if leaving IMAP; we leave the shared Google refresh token alone
 * since Contacts may still need it).
 */
export async function clearEmailTransport(): Promise<EmailStatus> {
  await clearImapPasswords()
  await patchEmailSettings({
    transport: null,
    account: { address: null, displayName: null },
    imap: null,
    smtp: null,
    lastSyncAt: null
  })
  return getEmailStatus()
}

// ── Read operations ─────────────────────────────────────────────────────

export async function listFolders(): Promise<EmailFolder[]> {
  const t = await getActiveTransport()
  return t.listFolders()
}

export async function listMessages(args: ListMessagesArgs): Promise<EmailMessageSummary[]> {
  const t = await getActiveTransport()
  return t.listMessages(args)
}

export async function search(args: SearchArgs): Promise<EmailMessageSummary[]> {
  const t = await getActiveTransport()
  return t.search(args)
}

export async function getMessage(messageId: string): Promise<EmailMessage> {
  const t = await getActiveTransport()
  const msg = await t.getMessage(messageId)
  await patchEmailSettings({ lastSyncAt: Date.now() })
  return msg
}

// ── Write operations ────────────────────────────────────────────────────

export async function createDraft(args: DraftMessageArgs): Promise<{ draftId: string }> {
  const t = await getActiveTransport()
  return t.createDraft(args)
}

export async function sendMessage(args: SendMessageArgs): Promise<{ messageId: string }> {
  const t = await getActiveTransport()
  return t.sendMessage(args)
}

export async function reply(args: ReplyArgs): Promise<{ messageId: string }> {
  const t = await getActiveTransport()
  return t.reply(args)
}

export async function forward(args: ForwardArgs): Promise<{ messageId: string }> {
  const t = await getActiveTransport()
  return t.forward(args)
}

// ── Triage ──────────────────────────────────────────────────────────────

export async function markRead(messageId: string, read: boolean): Promise<void> {
  const t = await getActiveTransport()
  await t.markRead(messageId, read)
}

export async function archiveMessage(messageId: string): Promise<void> {
  const t = await getActiveTransport()
  await t.archive(messageId)
}

export async function moveMessage(messageId: string, folder: string): Promise<void> {
  const t = await getActiveTransport()
  await t.move(messageId, folder)
}

export async function labelMessage(messageId: string, label: string, add: boolean): Promise<void> {
  const t = await getActiveTransport()
  await t.label(messageId, label, add)
}

export async function deleteMessage(messageId: string): Promise<void> {
  const t = await getActiveTransport()
  await t.deleteMessage(messageId)
}

// ── Misc helpers ────────────────────────────────────────────────────────

export type { EmailAccount }
