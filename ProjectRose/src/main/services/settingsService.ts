import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { agentSettingsPath } from '../lib/agentHome'
import { serviceStatus } from './serviceStatus'
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings } from '../../shared/memory'
import { DEFAULT_EMAIL_SETTINGS, type EmailSettings } from '../../shared/email'
import { DEFAULT_TTS_SETTINGS, type TtsSettings } from '../../shared/tts'
import { logInteraction } from './interactionLog'

export interface ModelConfig {
  provider: 'ollama' | 'projectrose' | 'kimi'
  modelName: string
}

export interface AppSettings {
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
  activeListeningDraftSeconds: number
  whisperModel: string
  hostMode: 'projectrose' | 'kimi' | 'self'
  agentStartsExpanded: boolean
  lastMainView: 'bloom' | 'editor'
  ollamaBaseUrl: string
  // The single Ollama model name to run when hostMode === 'self'. Empty until
  // the user types one in Settings → Providers → Ollama. ProjectRose mode
  // ignores this and uses the inline 'managed' model in modelSelection.ts.
  ollamaModelName: string
  // The Kimi Code model to run when hostMode === 'kimi'. The OAuth token pair
  // is NOT here — it lives in userData/kimi-session.bin via safeStorage.
  kimiModelName: string
  // Memory subsystem (host-level, agent-global at ~/.rose/memory/). The
  // diary scheduler reads enabled + time; the renderer Memory tab writes
  // them through the same settings:set IPC.
  memory: MemorySettings
  // Email subsystem (rose-email built-in extension). Host-owned per ADR 0010
  // so built-ins can read/write directly. IMAP/SMTP passwords are NOT here —
  // they live in userData/email-imap.bin via safeStorage.
  email: EmailSettings
  // Text-to-speech (built-in Piper). Auto-play toggle + voice + speed; voice
  // files live under ~/.rose/cache/piper/voices/.
  tts: TtsSettings
  // User-supplied Google OAuth credentials plus the signed-in account email.
  // Only the clientId is persisted here; the client_secret is sealed in
  // userData/google-oauth-secret.bin via safeStorage (ADR 0009). The
  // signedInEmail is the canonical record of who's signed in — agent-global,
  // shared by all Google integrations (Contacts, Email, …).
  googleAuth?: { clientId: string; signedInEmail?: string | null }
  // Allow callers to read/write arbitrary keys we don't enumerate.
  [key: string]: unknown
}

const DEFAULT_SETTINGS: AppSettings = {
  micDeviceId: '',
  userName: '',
  agentName: '',
  roseSpeechSpeakerId: null,
  activeListeningSetupComplete: false,
  activeListeningDraftSeconds: 8,
  whisperModel: 'Xenova/whisper-tiny.en',
  hostMode: 'self',
  agentStartsExpanded: false,
  lastMainView: 'bloom',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModelName: '',
  kimiModelName: 'kimi-for-coding',
  memory: DEFAULT_MEMORY_SETTINGS,
  email: DEFAULT_EMAIL_SETTINGS,
  tts: DEFAULT_TTS_SETTINGS
}

export async function readSettings(_rootPath?: string): Promise<AppSettings> {
  const path = agentSettingsPath()
  let stored: Partial<AppSettings> = {}
  try { stored = JSON.parse(await readFile(path, 'utf-8')) } catch { /* defaults */ }

  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    // memory is a nested block — shallow-merge so stored partials don't drop
    // newly-introduced default keys.
    memory: { ...DEFAULT_MEMORY_SETTINGS, ...(stored.memory ?? {}) },
    // email is also a nested block — same shallow-merge rule so users on old
    // settings.json get the new fields filled with their defaults.
    email: { ...DEFAULT_EMAIL_SETTINGS, ...(stored.email ?? {}) },
    // tts is also a nested block; same merge rule applies so flipping the
    // toggle on a fresh install doesn't drop the default voice/speed.
    tts: { ...DEFAULT_TTS_SETTINGS, ...(stored.tts ?? {}) }
  }

  // Drop any legacy navItems entry — the host no longer has a navigation bar.
  delete (merged as Record<string, unknown>).navItems

  // Drop the legacy email quarantine block (the heuristic prompt-injection
  // scanner was removed; old settings.json files may still carry it).
  delete (merged.email as unknown as Record<string, unknown>).quarantine

  // Drop legacy provider config (anthropic/openai/bedrock/openai-compatible
  // were removed when ProjectRose narrowed to projectrose + ollama). Older
  // ~/.rose/settings.json files may still carry these fields.
  delete (merged as Record<string, unknown>).providerKeys
  delete (merged as Record<string, unknown>).openaiCompatBaseUrl
  delete (merged as Record<string, unknown>).openaiCompatApiKey

  // Migrate from the old multi-model + router shape: lift the default Ollama
  // model name out of models[] and drop the now-unused fields. Runs once per
  // settings.json that still has the old shape.
  const legacyModels = (merged as Record<string, unknown>).models
  const legacyDefaultId = (merged as Record<string, unknown>).defaultModelId
  if (Array.isArray(legacyModels) && !merged.ollamaModelName) {
    const ollamaModels = legacyModels.filter(
      (m): m is { id?: string; provider?: string; modelName?: string } =>
        !!m && typeof m === 'object' && (m as { provider?: unknown }).provider === 'ollama'
    )
    const chosen =
      ollamaModels.find((m) => m.id && m.id === legacyDefaultId) ?? ollamaModels[0]
    if (chosen?.modelName) merged.ollamaModelName = chosen.modelName
  }
  delete (merged as Record<string, unknown>).models
  delete (merged as Record<string, unknown>).defaultModelId
  delete (merged as Record<string, unknown>).router

  // Behavior & Context section was removed — the thinking-injection toggle
  // and user-tunable compression threshold are gone; compression now runs on
  // a fixed default. Drop any stored values so settings.json stays minimal.
  delete (merged as Record<string, unknown>).includeThinkingInContext
  delete (merged as Record<string, unknown>).compressionThresholdPct

  // Strip the legacy per-extension namespaced blob if a pre-refactor
  // ~/.rose/settings.json (or the carried-over userData/settings.json) still
  // has it. Extensions read/write their own per-workspace settings now.
  delete (merged as Record<string, unknown>).extensions

  return merged
}

export async function writeSettings(settings: AppSettings, _rootPath?: string): Promise<void> {
  const path = agentSettingsPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(settings, null, 2), 'utf-8')
}

export async function applySettingsPatch(
  patch: Partial<AppSettings>,
  rootPath?: string
): Promise<AppSettings> {
  const current = await readSettings(rootPath)
  const updated = { ...current, ...patch }
  await writeSettings(updated, rootPath)
  // Log one interaction per top-level key the user changed. We deliberately
  // log the key name only — never the value — so the entry is privacy-safe
  // even for password / token fields.
  for (const key of Object.keys(patch)) {
    logInteraction('settings.changed', key)
  }
  return updated
}

export interface ServiceHealth {
  name: string
  url: string
  status: 'up' | 'down'
  latency?: number
}

export async function checkServicesHealth(): Promise<ServiceHealth[]> {
  serviceStatus.roseSpeech = true
  return []
}
