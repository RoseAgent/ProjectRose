import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'

// Optional API key for the user-configured OpenAI-compatible endpoint. The
// endpoint URL and model name are ordinary settings; the key stays encrypted
// in Electron's userData directory and is write-only across IPC.

function credentialsPath(): string {
  return join(app.getPath('userData'), 'openai-compatible-key.bin')
}

export async function loadOpenAICompatibleApiKey(): Promise<string | null> {
  let buf: Buffer
  try {
    buf = await readFile(credentialsPath())
  } catch {
    return null
  }

  try {
    const value = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : Buffer.from(buf.toString('utf-8'), 'base64').toString('utf-8')
    return value.trim() || null
  } catch {
    return null
  }
}

export async function saveOpenAICompatibleApiKey(apiKey: string): Promise<void> {
  const value = apiKey.trim()
  if (!value) throw new Error('Enter an API key before saving.')

  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(Buffer.from(value, 'utf-8').toString('base64'), 'utf-8')
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[openai-compatible] safeStorage unavailable — writing base64 fallback')
  }
  await writeFile(credentialsPath(), buf)
}

export async function clearOpenAICompatibleApiKey(): Promise<void> {
  try {
    await unlink(credentialsPath())
  } catch {
    // Missing is already clear.
  }
}

export async function hasOpenAICompatibleApiKey(): Promise<boolean> {
  return (await loadOpenAICompatibleApiKey()) !== null
}
