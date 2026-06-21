// safeStorage-encrypted bot tokens for rose-channels. Mirrors the IMAP
// password store pattern (src/main/services/email/imapCredentialsStore.ts).
//
// Bot tokens live in userData/channels-secrets.bin. The non-secret bits
// (bot tag, connected flag) live in the per-extension settings file under
// `<workspace>/.projectrose/extensions/rose-channels/settings.json`, written
// via ctx.updateSettings.

import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'

const SECRET_FILENAME = 'channels-secrets.bin'

function secretPath(): string {
  return join(app.getPath('userData'), SECRET_FILENAME)
}

export interface ChannelSecrets {
  discordBotToken: string | null
  slackBotToken: string | null
  /** Slack Socket Mode app-level token (xapp-...). */
  slackAppToken: string | null
}

const EMPTY: ChannelSecrets = {
  discordBotToken: null,
  slackBotToken: null,
  slackAppToken: null
}

export async function readChannelSecrets(): Promise<ChannelSecrets> {
  if (!safeStorage.isEncryptionAvailable()) return { ...EMPTY }
  try {
    const buf = await readFile(secretPath())
    const decrypted = safeStorage.decryptString(buf)
    const parsed = JSON.parse(decrypted) as Partial<ChannelSecrets>
    return {
      discordBotToken: typeof parsed.discordBotToken === 'string' ? parsed.discordBotToken : null,
      slackBotToken: typeof parsed.slackBotToken === 'string' ? parsed.slackBotToken : null,
      slackAppToken: typeof parsed.slackAppToken === 'string' ? parsed.slackAppToken : null
    }
  } catch {
    return { ...EMPTY }
  }
}

async function persistAll(secrets: ChannelSecrets): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain is unavailable; cannot store channel credentials securely.')
  }
  // If everything is null, remove the file rather than writing an empty blob.
  if (!secrets.discordBotToken && !secrets.slackBotToken && !secrets.slackAppToken) {
    await unlink(secretPath()).catch(() => { /* tolerate */ })
    return
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
  await writeFile(secretPath(), encrypted)
}

export async function setDiscordToken(token: string | null): Promise<void> {
  const current = await readChannelSecrets()
  await persistAll({ ...current, discordBotToken: token })
}

export async function setSlackTokens(args: {
  botToken: string | null
  appToken: string | null
}): Promise<void> {
  const current = await readChannelSecrets()
  await persistAll({
    ...current,
    slackBotToken: args.botToken,
    slackAppToken: args.appToken
  })
}

export async function clearAllChannelSecrets(): Promise<void> {
  await unlink(secretPath()).catch(() => { /* tolerate */ })
}
