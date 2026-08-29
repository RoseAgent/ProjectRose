import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'

// Doppler CLI-style auth token (device flow against api.doppler.com — the
// same flow `doppler login` uses; see dopplerAuthService.ts). Stored
// encrypted in userData/doppler-token.bin with Electron safeStorage. Unlike
// a pasted service token, this token is
// workplace-scoped, so secrets downloads must name a project + config.

export const DOPPLER_API_HOST = 'https://api.doppler.com'

function dopplerTokenPath(): string {
  return join(app.getPath('userData'), 'doppler-token.bin')
}

export async function loadDopplerToken(): Promise<string | null> {
  let buf: Buffer
  try {
    buf = await readFile(dopplerTokenPath())
  } catch {
    return null
  }
  try {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : Buffer.from(buf.toString('utf-8'), 'base64').toString('utf-8')
  } catch {
    return null
  }
}

export async function saveDopplerToken(token: string): Promise<void> {
  const trimmed = token.trim()
  if (!trimmed) throw new Error('Empty Doppler token.')
  let buf: Buffer
  if (safeStorage.isEncryptionAvailable()) {
    buf = safeStorage.encryptString(trimmed)
  } else {
    console.warn('[doppler] safeStorage unavailable — writing base64-encoded plaintext fallback')
    buf = Buffer.from(Buffer.from(trimmed, 'utf-8').toString('base64'), 'utf-8')
  }
  await writeFile(dopplerTokenPath(), buf)
}

export async function clearDopplerToken(): Promise<void> {
  try {
    await unlink(dopplerTokenPath())
  } catch {
    // ENOENT is fine — already gone.
  }
}
