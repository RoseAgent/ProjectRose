// BYO web-search API key store. The provider choice lives in
// ~/.rose/settings.json under `search.provider`; the API key is encrypted
// with Electron's safeStorage and written to userData/search-api-key.bin —
// the same shape as the Google OAuth client secret (ADR 0009).

import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'
import { applySettingsPatch } from '../settingsService'
import type { SearchProvider } from '../settingsService'

const KEY_FILENAME = 'search-api-key.bin'

function keyPath(): string {
  return join(app.getPath('userData'), KEY_FILENAME)
}

export async function readSearchApiKey(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const buf = await readFile(keyPath())
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export async function saveSearchCredentials(provider: SearchProvider, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('An API key is required.')
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain is unavailable; cannot store the search API key securely.')
  }
  await writeFile(keyPath(), safeStorage.encryptString(trimmed))
  await applySettingsPatch({ search: { provider } })
}

export async function clearSearchCredentials(): Promise<void> {
  await unlink(keyPath()).catch(() => { /* tolerate missing file */ })
  await applySettingsPatch({ search: undefined })
}

export async function searchCredentialsConfigured(): Promise<boolean> {
  return (await readSearchApiKey()) !== null
}
