import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { agentSettingsPath } from '../lib/agentHome'
import { serviceStatus } from './serviceStatus'
import { DEFAULT_CONTACTS_SETTINGS, type ContactsSettings } from '../../shared/contacts'
import { DEFAULT_CALENDAR_SETTINGS, type CalendarSettings } from '../../shared/calendar'
import { DEFAULT_EMAIL_SETTINGS, type EmailSettings } from '../../shared/email'
import { DEFAULT_TTS_SETTINGS, type TtsSettings } from '../../shared/tts'
import { logInteraction } from './interactionLog'
import {
  DEFAULT_KIMI_MODEL,
  DEFAULT_KIMI_PLATFORM_MODEL,
  PROJECTROSE_MODEL,
  type ModelConfig
} from '../../shared/modelConfig'

export type { ModelConfig } from '../../shared/modelConfig'

export type SearchProvider = 'brave' | 'tavily' | 'browserbase'

export interface AppSettings {
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
  activeListeningDraftSeconds: number
  whisperModel: string
  lastMainView: 'bloom' | 'editor'
  ollamaBaseUrl: string
  // How Kimi authenticates: 'oauth' (kimi.com account, device flow, Coding
  // API) or 'apikey' (BYO Moonshot platform key → api.moonshot.ai/v1). The
  // key itself lives in userData/kimi-api-key.bin via safeStorage.
  kimiAuthMethod: 'oauth' | 'apikey'
  // AWS region the Bedrock provider talks to. Not a secret, so it lives here
  // rather than in the sealed store — the key pair itself is in
  // userData/bedrock-credentials.bin via safeStorage. Region is load-bearing
  // beyond routing: which models exist, and which inference profiles are
  // reachable, is region-scoped.
  bedrockRegion: string
  // The most recent provider+model pair the user picked in the chat
  // composer's ModelPicker. Not a user-facing setting: it seeds the picker
  // for new Conversations and is the model background LLM work (compression,
  // detached extension runs) falls back to. Absent until the first pick (or
  // the legacy-hostMode migration below fills it).
  lastModel?: ModelConfig | null
  // Contacts (~/.rose/contact/) — Google Contacts sync state.
  contacts: ContactsSettings
  // Events (~/.rose/calendar/) — Google Calendar sync state.
  calendar: CalendarSettings
  // Email subsystem (rose-email built-in extension). Host-owned per ADR 0010
  // so built-ins can read/write directly. IMAP/SMTP passwords are NOT here —
  // they live in userData/email-imap.bin via safeStorage.
  email: EmailSettings
  // Text-to-speech (built-in Piper). Auto-play toggle + voice + speed; voice
  // files live under ~/.rose/cache/piper/voices/.
  tts: TtsSettings
  // BYO web-search provider for the `search_web` tool. Only the provider
  // choice lives here — the API key is sealed in userData/search-api-key.bin
  // via safeStorage (see search/searchCredentialsStore.ts). Absent until the
  // user configures a provider in Settings > Providers > Search.
  search?: { provider: SearchProvider }
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
  lastMainView: 'bloom',
  ollamaBaseUrl: 'http://localhost:11434',
  kimiAuthMethod: 'oauth',
  bedrockRegion: 'us-east-1',
  contacts: DEFAULT_CONTACTS_SETTINGS,
  calendar: DEFAULT_CALENDAR_SETTINGS,
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
    // contacts/calendar are nested blocks — shallow-merge so stored partials
    // don't drop newly-introduced default keys.
    contacts: { ...DEFAULT_CONTACTS_SETTINGS, ...(stored.contacts ?? {}) },
    calendar: { ...DEFAULT_CALENDAR_SETTINGS, ...(stored.calendar ?? {}) },
    // email is also a nested block — same shallow-merge rule so users on old
    // settings.json get the new fields filled with their defaults.
    email: { ...DEFAULT_EMAIL_SETTINGS, ...(stored.email ?? {}) },
    // tts is also a nested block; same merge rule applies so flipping the
    // toggle on a fresh install doesn't drop the default voice/speed.
    tts: { ...DEFAULT_TTS_SETTINGS, ...(stored.tts ?? {}) }
  }

  // Migrate from the retired host-memory era (ADR 0019): the Google sync
  // state for Contacts and Events used to live under settings.memory. Lift it
  // into the new blocks once, then drop the memory key — the name is reserved
  // for the future memory system. Diary/behavior-record fields die here.
  const legacyMemory = (merged as Record<string, unknown>).memory as
    | { googleSync?: ContactsSettings['googleSync']; googleCalendarSync?: CalendarSettings['googleSync'] }
    | undefined
  if (legacyMemory) {
    if (!stored.contacts && legacyMemory.googleSync) {
      merged.contacts = { googleSync: { ...DEFAULT_CONTACTS_SETTINGS.googleSync, ...legacyMemory.googleSync } }
    }
    if (!stored.calendar && legacyMemory.googleCalendarSync) {
      merged.calendar = { googleSync: { ...DEFAULT_CALENDAR_SETTINGS.googleSync, ...legacyMemory.googleCalendarSync } }
    }
    delete (merged as Record<string, unknown>).memory
  }

  // Drop any legacy navItems entry — the host no longer has a navigation bar.
  delete (merged as Record<string, unknown>).navItems

  // Drop the legacy email quarantine block (the heuristic prompt-injection
  // scanner was removed; old settings.json files may still carry it).
  delete (merged.email as unknown as Record<string, unknown>).quarantine

  // Drop legacy provider config (anthropic/openai/bedrock/openai-compatible
  // were removed when ProjectRose narrowed to projectrose + ollama). Older
  // ~/.rose/settings.json files may still carry these fields.
  //
  // Bedrock has since been reintroduced, but deliberately not through
  // `providerKeys`: its credentials are sealed in userData/*.bin like every
  // other secret, and only `bedrockRegion` (non-secret) lives in settings.json.
  // So this strip stays as-is — it must keep removing the old plaintext-key
  // blob, which is exactly what we don't want back.
  delete (merged as Record<string, unknown>).providerKeys
  delete (merged as Record<string, unknown>).openaiCompatBaseUrl
  delete (merged as Record<string, unknown>).openaiCompatApiKey

  // Migrate from the old multi-model + router shape: lift the default Ollama
  // model name out of models[] (used by the lastModel migration below) and
  // drop the now-unused fields.
  const legacy = merged as Record<string, unknown>
  const legacyModels = legacy.models
  const legacyDefaultId = legacy.defaultModelId
  if (Array.isArray(legacyModels) && !legacy.ollamaModelName) {
    const ollamaModels = legacyModels.filter(
      (m): m is { id?: string; provider?: string; modelName?: string } =>
        !!m && typeof m === 'object' && (m as { provider?: unknown }).provider === 'ollama'
    )
    const chosen =
      ollamaModels.find((m) => m.id && m.id === legacyDefaultId) ?? ollamaModels[0]
    if (chosen?.modelName) legacy.ollamaModelName = chosen.modelName
  }
  delete legacy.models
  delete legacy.defaultModelId
  delete legacy.router

  // Migrate from the global hostMode era: the active provider + model choice
  // moved into the chat composer (per-Conversation, persisted on the
  // Conversation). Synthesize lastModel from the legacy fields once, then
  // drop them so settings.json stays minimal.
  if (!merged.lastModel) {
    const hostMode = legacy.hostMode
    const kimiModelName = typeof legacy.kimiModelName === 'string' ? legacy.kimiModelName : ''
    const ollamaModelName = typeof legacy.ollamaModelName === 'string' ? legacy.ollamaModelName : ''
    if (hostMode === 'projectrose') {
      merged.lastModel = PROJECTROSE_MODEL
    } else if (hostMode === 'kimi') {
      const fallback =
        merged.kimiAuthMethod === 'apikey' ? DEFAULT_KIMI_PLATFORM_MODEL : DEFAULT_KIMI_MODEL
      merged.lastModel = { provider: 'kimi', modelName: kimiModelName || fallback }
    } else if (ollamaModelName) {
      merged.lastModel = { provider: 'ollama', modelName: ollamaModelName }
    }
  }
  delete legacy.hostMode
  delete legacy.kimiModelName
  delete legacy.ollamaModelName

  // The bloom view is always full screen on entry now — the "agent starts
  // expanded" toggle it replaced is gone.
  delete legacy.agentStartsExpanded

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
