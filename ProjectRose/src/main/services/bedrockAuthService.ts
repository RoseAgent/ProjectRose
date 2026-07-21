import { BrowserWindow } from 'electron'
import { AwsClient } from 'aws4fetch'
import { IPC } from '../../shared/ipcChannels'
import {
  loadBedrockCredentials,
  saveBedrockCredentials,
  clearBedrockCredentials,
  hasBedrockCredentials,
  type BedrockCredentials
} from '../lib/bedrockCredentials'
import { readSettings } from './settingsService'

// Amazon Bedrock account wiring. Unlike ProjectRose and Kimi there's no
// interactive sign-in flow — Bedrock authenticates with SigV4-signed requests,
// so "connecting" is just storing an AWS key pair. What this service adds over
// the raw credential store is the live model list (below) and the change
// broadcast the renderer's provider store listens on.

const REQUEST_TIMEOUT_MS = 15_000

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

async function emitChanged(): Promise<void> {
  notifyRenderer(IPC.BEDROCK_AUTH_CHANGED, await getBedrockAuthStatus())
}

export interface BedrockAuthStatus {
  // Whether an AWS key pair is stored. The keys themselves never cross IPC.
  credentialsStored: boolean
  region: string
}

export async function getBedrockAuthStatus(): Promise<BedrockAuthStatus> {
  const { bedrockRegion } = await readSettings()
  return { credentialsStored: await hasBedrockCredentials(), region: bedrockRegion }
}

export async function bedrockSaveCredentials(
  creds: BedrockCredentials
): Promise<BedrockAuthStatus> {
  await saveBedrockCredentials(creds)
  await emitChanged()
  return getBedrockAuthStatus()
}

export async function bedrockClearCredentials(): Promise<BedrockAuthStatus> {
  await clearBedrockCredentials()
  await emitChanged()
  return getBedrockAuthStatus()
}

/** A SigV4 client bound to the stored keys, or an actionable throw. */
async function bedrockControlPlaneClient(): Promise<{ client: AwsClient; region: string }> {
  const creds = await loadBedrockCredentials()
  if (!creds) {
    throw new Error('Add your AWS credentials in Settings → Providers → Amazon Bedrock.')
  }
  const { bedrockRegion } = await readSettings()
  return {
    region: bedrockRegion,
    client: new AwsClient({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      service: 'bedrock',
      region: bedrockRegion
    })
  }
}

type ControlPlane = Awaited<ReturnType<typeof bedrockControlPlaneClient>>

async function signedGet<T>({ client, region }: ControlPlane, path: string): Promise<T> {
  // Control plane (bedrock.*), not the runtime host (bedrock-runtime.*) —
  // model discovery and invocation are separate endpoints and separate IAM
  // actions (bedrock:ListFoundationModels vs bedrock:InvokeModel).
  const url = `https://bedrock.${region}.amazonaws.com${path}`
  const res = await client.fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // AWS error payloads carry { message } or { Message }; surface it so a
    // missing IAM permission reads as such instead of a bare status code.
    let detail = ''
    try {
      const parsed = JSON.parse(body) as { message?: string; Message?: string }
      detail = parsed.message ?? parsed.Message ?? ''
    } catch {
      /* not JSON */
    }
    throw new Error(`Bedrock request failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as T
}

// Only the fields we actually read — the real payloads are much wider.
// outputModalities isn't here because the TEXT filter is applied server-side
// via the byOutputModality query param.
interface FoundationModelSummary {
  modelId?: unknown
  inferenceTypesSupported?: unknown
  modelLifecycle?: { status?: unknown }
}

interface InferenceProfileSummary {
  inferenceProfileId?: unknown
  status?: unknown
}

/**
 * The Bedrock model ids this account+region can actually invoke, fetched live
 * from the control plane. The renderer's ModelPicker builds its Bedrock group
 * from this — we never hardcode the list, so a newly-granted model appears
 * without an app update.
 *
 * Two endpoints are merged because Bedrock has two invocation identities:
 *   - `/foundation-models` → base ids (`anthropic.claude-…`), invocable
 *     directly only when the model advertises ON_DEMAND. Models that list
 *     only INFERENCE_PROFILE are dropped: invoking them by base id fails with
 *     a validation error telling you to use a profile.
 *   - `/inference-profiles` → cross-region profile ids (`us.anthropic.claude-…`),
 *     which is how most current-generation models are reachable at all.
 *
 * Neither endpoint reflects per-model access grants, so an id can be listed
 * and still 403 on first use — that surfaces at send time with Bedrock's own
 * "you don't have access to the model" message, which is more actionable than
 * anything we could synthesize here.
 */
export async function listBedrockModels(): Promise<string[]> {
  const ids = new Set<string>()
  // One client for both calls — building it reads the sealed credentials and
  // settings from disk, which shouldn't happen twice per refresh.
  const plane = await bedrockControlPlaneClient()

  const foundation = await signedGet<{ modelSummaries?: FoundationModelSummary[] }>(
    plane,
    '/foundation-models?byOutputModality=TEXT'
  )
  for (const m of foundation.modelSummaries ?? []) {
    if (typeof m.modelId !== 'string' || !m.modelId) continue
    const lifecycle = m.modelLifecycle?.status
    if (lifecycle === 'LEGACY') continue
    const inferenceTypes = Array.isArray(m.inferenceTypesSupported) ? m.inferenceTypesSupported : []
    if (!inferenceTypes.includes('ON_DEMAND')) continue
    ids.add(m.modelId)
  }

  // A missing bedrock:ListInferenceProfiles permission shouldn't blank the
  // whole picker when the foundation-model list already succeeded.
  try {
    const profiles = await signedGet<{ inferenceProfileSummaries?: InferenceProfileSummary[] }>(
      plane,
      '/inference-profiles?maxResults=1000'
    )
    for (const p of profiles.inferenceProfileSummaries ?? []) {
      if (typeof p.inferenceProfileId !== 'string' || !p.inferenceProfileId) continue
      if (p.status !== 'ACTIVE') continue
      ids.add(p.inferenceProfileId)
    }
  } catch (err) {
    console.warn(
      '[bedrock] inference-profile list failed:',
      err instanceof Error ? err.message : err
    )
  }

  return [...ids].sort()
}
