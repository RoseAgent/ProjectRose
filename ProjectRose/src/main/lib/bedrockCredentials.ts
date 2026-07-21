import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'

// AWS credentials for Amazon Bedrock. Stored encrypted in
// userData/bedrock-credentials.bin — same safeStorage pattern as
// kimiSession.ts and session.ts.
//
// Explicit keys only: we deliberately do NOT fall back to the ambient AWS
// credential chain (~/.aws/credentials, SSO, instance roles). A packaged
// Electron app launched from Finder/Explorer doesn't inherit the shell
// environment, so the chain would resolve differently depending on how the
// app was started — an unexplainable "works in dev, not in the build" split.
// The region is not a secret and lives in ~/.rose/settings.json
// (AppSettings.bedrockRegion) alongside ollamaBaseUrl.

export interface BedrockCredentials {
  accessKeyId: string
  secretAccessKey: string
  // Only set for temporary credentials (STS / assumed roles). Those expire,
  // so the user has to re-paste them; permanent IAM user keys don't.
  sessionToken?: string
}

function bedrockCredentialsPath(): string {
  return join(app.getPath('userData'), 'bedrock-credentials.bin')
}

export async function loadBedrockCredentials(): Promise<BedrockCredentials | null> {
  let buf: Buffer
  try {
    buf = await readFile(bedrockCredentialsPath())
  } catch {
    return null
  }
  try {
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : Buffer.from(buf.toString('utf-8'), 'base64').toString('utf-8')
    const parsed = JSON.parse(json) as BedrockCredentials
    if (!parsed.accessKeyId || !parsed.secretAccessKey) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveBedrockCredentials(creds: BedrockCredentials): Promise<void> {
  const accessKeyId = creds.accessKeyId.trim()
  const secretAccessKey = creds.secretAccessKey.trim()
  const sessionToken = creds.sessionToken?.trim()
  if (!accessKeyId) throw new Error('An AWS access key ID is required.')
  if (!secretAccessKey) throw new Error('An AWS secret access key is required.')

  const json = JSON.stringify({
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {})
  })
  let buf: Buffer
  if (safeStorage.isEncryptionAvailable()) {
    buf = safeStorage.encryptString(json)
  } else {
    console.warn('[bedrock] safeStorage unavailable — writing base64-encoded plaintext fallback')
    buf = Buffer.from(Buffer.from(json, 'utf-8').toString('base64'), 'utf-8')
  }
  await writeFile(bedrockCredentialsPath(), buf)
}

export async function clearBedrockCredentials(): Promise<void> {
  try {
    await unlink(bedrockCredentialsPath())
  } catch {
    // ENOENT is fine — already gone.
  }
}

export async function hasBedrockCredentials(): Promise<boolean> {
  return (await loadBedrockCredentials()) !== null
}
