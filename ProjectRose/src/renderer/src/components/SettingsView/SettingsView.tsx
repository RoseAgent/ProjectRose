import { useEffect, useState, useCallback } from 'react'
import { ExtensionsTab } from './ExtensionsTab'
import { PromptsTab } from './PromptsTab'
import { UpdatesTab } from './UpdatesTab'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useStatusStore } from '../../stores/useStatusStore'
import { useViewStore } from '../../stores/useViewStore'
import { useWhisperPreloadStore } from '../../stores/useWhisperPreloadStore'
import { useProviderStore } from '../../stores/useProviderStore'
import { subscribeToExtensionsChange } from '../../extensions/registry'
import type { ToolMeta } from '@shared/types'
import type { GoogleSyncStatus } from '@shared/contacts'
import styles from './SettingsView.module.css'
import { WhisperModelInstallModal, type WhisperModelOption } from './WhisperModelInstallModal'
import whisperModalStyles from './WhisperModelInstallModal.module.css'

const WHISPER_MODEL_OPTIONS: WhisperModelOption[] = [
  { id: 'Xenova/whisper-tiny.en',   label: 'Tiny (English) — fastest',            size: '40 MB'  },
  { id: 'Xenova/whisper-base.en',   label: 'Base (English)',                      size: '150 MB' },
  { id: 'Xenova/whisper-small.en',  label: 'Small (English) — recommended',       size: '500 MB' },
  { id: 'Xenova/whisper-medium.en', label: 'Medium (English) — best quality',     size: '1.5 GB' }
]

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ProviderStatus = 'connected' | 'unverified' | 'missing' | 'error'

interface AudioDevice {
  deviceId: string
  label: string
}

// ─────────────────────────────────────────────────────────────
// Provider configuration
// ─────────────────────────────────────────────────────────────

interface FieldDef {
  key: string
  label: string
  placeholder: string
  secret: boolean
  hint?: string
}

const PROVIDER_FIELD_DEFS: Record<string, FieldDef[]> = {
  ollama: [
    { key: 'baseUrl', label: 'BASE URL', placeholder: 'http://localhost:11434', secret: false, hint: 'no key required · local' },
  ],
}

interface ProviderMeta {
  kind: string
  spec: string
  name: string
  latin: string
}

const PROVIDERS: ProviderMeta[] = [
  { kind: 'projectrose', spec: '00', name: 'ProjectRose',       latin: 'Rosa managed'    },
  { kind: 'ollama',      spec: '01', name: 'Ollama',            latin: 'Rosa localis'    },
  { kind: 'kimi',        spec: '02', name: 'Kimi',              latin: 'Rosa lunaris'    },
  { kind: 'bedrock',     spec: '03', name: 'Amazon Bedrock',    latin: 'Rosa fluminis'   },
]

// Doppler import — recognized secret names and where each one lands. Shown
// as the reference table in the Plate III card; detection itself lives in
// main (dopplerImport.ts) and accepts a few aliases per row.
const DOPPLER_KEY_ROWS: Array<{ secret: string; importsTo: string }> = [
  { secret: 'BRAVE_API_KEY',                        importsTo: 'Web Search — Brave' },
  { secret: 'TAVILY_API_KEY',                       importsTo: 'Web Search — Tavily' },
  { secret: 'BROWSERBASE_API_KEY',                  importsTo: 'Web Search — Browserbase' },
  { secret: 'MOONSHOT_API_KEY',                     importsTo: 'Kimi — platform API key' },
  { secret: 'AWS_ACCESS_KEY_ID + _SECRET_ACCESS_KEY', importsTo: 'Amazon Bedrock — AWS key pair' },
  { secret: 'GOOGLE_OAUTH_CLIENT_ID + _SECRET',     importsTo: 'Google — OAuth pair' },
]

const dopplerTd: React.CSSProperties = {
  padding: '5px 10px',
  border: '1px solid var(--color-bg-secondary)',
  fontSize: 11,
  textAlign: 'left',
  verticalAlign: 'baseline',
}
const dopplerTh: React.CSSProperties = {
  ...dopplerTd,
  color: 'var(--color-text-muted)',
  letterSpacing: 0.6,
  fontWeight: 600,
  fontSize: 10,
}

// ─────────────────────────────────────────────────────────────
// Pure components
// ─────────────────────────────────────────────────────────────

function ProviderGlyph({ kind, size = 28 }: { kind: string; size?: number }): JSX.Element | null {
  const c = 'var(--color-accent)'
  switch (kind) {
    case 'projectrose':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="16" cy="16" r="6" fill={c} stroke="none" />
          <path d="M16 4 C20 8 20 12 16 16 C12 12 12 8 16 4 Z" opacity="0.7" />
          <path d="M28 16 C24 20 20 20 16 16 C20 12 24 12 28 16 Z" opacity="0.7" />
          <path d="M16 28 C12 24 12 20 16 16 C20 20 20 24 16 28 Z" opacity="0.7" />
          <path d="M4 16 C8 12 12 12 16 16 C12 20 8 20 4 16 Z" opacity="0.7" />
        </svg>
      )
    case 'ollama':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <ellipse cx="16" cy="18" rx="9" ry="8"/>
          <ellipse cx="11" cy="10" rx="3" ry="4" fill={c} stroke="none"/>
          <ellipse cx="21" cy="10" rx="3" ry="4" fill={c} stroke="none"/>
          <circle cx="13" cy="17" r="1" fill={c} stroke="none"/>
          <circle cx="19" cy="17" r="1" fill={c} stroke="none"/>
        </svg>
      )
    case 'kimi':
      // Crescent moon — nod to Moonshot AI, kept single-colour like the rest.
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <path d="M21 5 A12 12 0 1 0 27 17 A9.5 9.5 0 0 1 21 5 Z" />
          <circle cx="23.5" cy="8.5" r="1.2" fill={c} stroke="none" />
        </svg>
      )
    case 'bedrock':
      // Layered strata over a river bend — "bedrock", kept single-colour and
      // deliberately not the AWS wordmark (trademark/brand-guideline reasons,
      // same call as the Google glyph below).
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <path d="M4 11 H28" strokeLinecap="round" />
          <path d="M4 17 H28" strokeLinecap="round" opacity="0.7" />
          <path d="M6 23 C11 20 21 26 26 23" strokeLinecap="round" />
          <circle cx="16" cy="6" r="2" fill={c} stroke="none" />
        </svg>
      )
    case 'google':
      // Stylised "G" mark — single-colour to match the accent palette;
      // intentionally not the full multicolour Google logo (which carries
      // trademark/brand-guideline constraints).
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.8">
          <path d="M22 12 A8 8 0 1 0 24 18 L16 18" strokeLinecap="round"/>
        </svg>
      )
    case 'search':
      // Magnifier — the BYO web-search provider card.
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.8">
          <circle cx="14" cy="14" r="8" />
          <path d="M20 20 L27 27" strokeLinecap="round" />
        </svg>
      )
    case 'doppler':
      // Droplet into a tray — secrets flowing in from Doppler.
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.8">
          <path d="M16 4 C20 10 22 13 22 16.5 A6 6 0 0 1 10 16.5 C10 13 12 10 16 4 Z" />
          <path d="M6 26 H26" strokeLinecap="round" />
        </svg>
      )
    default:
      return null
  }
}

function StatusBadge({ state }: { state: ProviderStatus }): JSX.Element {
  const map: Record<ProviderStatus, { color: string; cssVar: string; label: string; dot: boolean; pulse: boolean }> = {
    connected:  { color: 'var(--color-saved)',   cssVar: 'var(--color-saved)',  label: 'CONNECTED',  dot: true,  pulse: true  },
    unverified: { color: 'var(--color-unsaved)', cssVar: 'var(--color-unsaved)', label: 'UNVERIFIED', dot: true,  pulse: false },
    missing:    { color: 'var(--color-text-muted)', cssVar: 'var(--color-text-muted)', label: 'NOT SET', dot: false, pulse: false },
    error:      { color: 'var(--color-error)',   cssVar: 'var(--color-error)',  label: 'ERROR',      dot: true,  pulse: false },
  }
  const m = map[state]
  return (
    <span className={styles.statusBadge} style={{ color: m.color }}>
      {m.dot ? (
        <span
          className={`${styles.statusDot} ${m.pulse ? styles.okPulse : ''}`}
          style={{ background: m.color }}
        />
      ) : (
        <span className={styles.statusDotHollow} style={{ borderColor: m.color }} />
      )}
      {m.label}
    </span>
  )
}

function HToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className={`${styles.hToggle} ${on ? styles.hToggleOn : styles.hToggleOff}`}
    >
      <span className={styles.hToggleThumb} />
    </button>
  )
}

function SectionHeader({ n, title, sub, right }: {
  n: string; title: string; sub?: string; right?: React.ReactNode
}): JSX.Element {
  return (
    <div className={styles.sectionHeaderRow}>
      <div>
        <div className={styles.plateLabel}>PLATE {n}</div>
        <div className={styles.plateTitle}>{title}</div>
        {sub && <div className={styles.plateSub}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function HSettingRow({ label, desc, children }: {
  label: string; desc?: string; children: React.ReactNode
}): JSX.Element {
  return (
    <div className={styles.hSettingRow}>
      <div style={{ flex: 1 }}>
        <div className={styles.hSettingLabel}>{label}</div>
        {desc && <div className={styles.hSettingDesc}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function FieldRow({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}): JSX.Element {
  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldRowHeader}>
        <span className={styles.fieldLabel}>{label}</span>
        {hint && <span className={styles.fieldHint}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function KeyInput({ value, placeholder, onChange, type = 'password' }: {
  value: string
  placeholder: string
  onChange: (v: string) => void
  type?: 'password' | 'text'
}): JSX.Element {
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)

  function maskKey(s: string): string {
    if (s.length <= 8) return '•'.repeat(s.length)
    return s.slice(0, 4) + '•'.repeat(Math.min(s.length - 8, 14)) + s.slice(-4)
  }

  const masked = !show && type === 'password' && !!value && !focused

  return (
    <div className={`${styles.keyInputWrap} ${focused ? styles.keyInputWrapFocused : ''}`}>
      <input
        type={show || type === 'text' ? 'text' : 'password'}
        value={masked ? maskKey(value) : value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={styles.keyInputField}
        style={{ letterSpacing: masked ? 1 : 0.2 }}
      />
      {value && type === 'password' && (
        <button type="button" onClick={() => setShow((s) => !s)} className={styles.keyInputToggle}>
          {show ? 'HIDE' : 'SHOW'}
        </button>
      )}
    </div>
  )
}

interface UsageInfo {
  plan: string
  plan_budget_usd: number
  month_cost_usd: number
  month_remaining_usd: number
  pct: number
  over_budget: boolean
}

function UsageBar({ usage, loading, error, onRefresh }: {
  usage: UsageInfo | null
  loading: boolean
  error: string
  onRefresh: () => void
}): JSX.Element {
  const fillPct = usage ? Math.max(0, Math.min(100, usage.pct)) : 0
  const fillColor = usage?.over_budget
    ? 'var(--color-error)'
    : fillPct >= 80
      ? 'var(--color-unsaved)'
      : 'var(--color-saved)'

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: 1.4, color: 'var(--color-text-muted)', fontWeight: 500 }}>
          MONTHLY USAGE{usage ? ` · ${usage.plan.toUpperCase()}` : ''}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--color-text-muted)',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 9,
            letterSpacing: 1.4,
            fontFamily: 'inherit',
            fontWeight: 500,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'LOADING…' : '↻ REFRESH'}
        </button>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--color-bg-secondary)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${fillPct}%`,
            background: fillColor,
            transition: 'width 240ms ease',
          }}
        />
      </div>
      {usage ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)' }}>
          <span style={{ color: usage.over_budget ? 'var(--color-error)' : 'var(--color-text-primary)' }}>
            ${usage.month_cost_usd.toFixed(2)} of ${usage.plan_budget_usd.toFixed(2)}
          </span>
          <span>
            {usage.over_budget
              ? 'over budget'
              : `${usage.pct.toFixed(1)}% · $${usage.month_remaining_usd.toFixed(2)} left`}
          </span>
        </div>
      ) : error ? (
        <div style={{ fontSize: 11, color: 'var(--color-error)' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Loading usage…</div>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function SettingsView(): JSX.Element {
  const {
    micDeviceId, userName, agentName, activeListeningDraftSeconds, whisperModel,
    ollamaBaseUrl, kimiAuthMethod, bedrockRegion,
    tts,
    update,
  } = useSettingsStore()

  const rootPath = useProjectStore((s) => s.rootPath)

  // ── tool state ──
  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([])
  const [disabledTools, setDisabledTools] = useState<string[]>([])

  // ── nav ──
  const [activePage, setActivePage] = useState('general')

  // ── audio ──
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])

  // ── model fetch state ──
  const [ollamaModels, setOllamaModels] = useState<Record<string, string[]>>({})
  const [ollamaFetching, setOllamaFetching] = useState<Record<string, boolean>>({})

  // ── provider card state ──
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [testedProviders, setTestedProviders] = useState<Record<string, 'connected' | 'error'>>({})
  const [providerTesting, setProviderTesting] = useState<Record<string, boolean>>({})

  // ── projectrose account state ──
  const [prAccount, setPrAccount] = useState<{ loggedIn: boolean; email: string; name: string }>({ loggedIn: false, email: '', name: '' })
  const [prMode, setPrMode] = useState<'idle' | 'pending'>('idle')
  const [prPairingUrl, setPrPairingUrl] = useState('')
  const [prError, setPrError] = useState('')
  const [prUsage, setPrUsage] = useState<{
    plan: string
    plan_budget_usd: number
    month_cost_usd: number
    month_remaining_usd: number
    pct: number
    over_budget: boolean
  } | null>(null)
  const [prUsageLoading, setPrUsageLoading] = useState(false)
  const [prUsageError, setPrUsageError] = useState('')

  const loadProjectRoseUsage = useCallback(async () => {
    setPrUsageLoading(true)
    setPrUsageError('')
    try {
      const result = await window.api.auth.getUsage()
      if (result.ok) {
        setPrUsage(result.usage)
      } else {
        setPrUsage(null)
        setPrUsageError(result.error)
      }
    } finally {
      setPrUsageLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.api.auth.getStatus().then((s) => { if (!cancelled) setPrAccount({ loggedIn: s.loggedIn, email: s.email, name: s.name }) })
    const offChanged = window.api.auth.onChanged((d) => {
      setPrAccount({ loggedIn: d.loggedIn, email: d.email, name: d.name })
      setPrMode('idle')
      setPrPairingUrl('')
      setPrError('')
    })
    const offPending = window.api.auth.onPairingPending((d) => {
      setPrPairingUrl(d.url)
      setPrMode('pending')
      setPrError('')
    })
    return () => { cancelled = true; offChanged(); offPending() }
  }, [])

  useEffect(() => {
    if (expandedProvider !== 'projectrose' || !prAccount.loggedIn) return
    loadProjectRoseUsage()
  }, [expandedProvider, prAccount.loggedIn, loadProjectRoseUsage])

  useEffect(() => {
    if (!prAccount.loggedIn) {
      setPrUsage(null)
      setPrUsageError('')
    }
  }, [prAccount.loggedIn])

  async function projectroseSignIn(): Promise<void> {
    setPrError('')
    setPrMode('pending')
    try {
      await window.api.auth.login()
    } catch (e) {
      setPrError(e instanceof Error ? e.message : 'Sign-in failed')
      setPrMode('idle')
      setPrPairingUrl('')
    }
  }

  async function projectroseCancel(): Promise<void> {
    try { await window.api.auth.cancel() } catch { /* ignore */ }
    setPrMode('idle')
    setPrPairingUrl('')
  }

  async function projectroseSignOut(): Promise<void> {
    try { await window.api.auth.logout() } catch { /* ignore */ }
  }

  // ── kimi account state ──
  const [kimiAccount, setKimiAccount] = useState<{ loggedIn: boolean; apiKeyStored: boolean }>({
    loggedIn: false,
    apiKeyStored: false,
  })
  const [kimiMode, setKimiMode] = useState<'idle' | 'pending'>('idle')
  const [kimiPending, setKimiPending] = useState<{ url: string; userCode: string } | null>(null)
  const [kimiError, setKimiError] = useState('')
  // BYO Moonshot API key draft — write-only across IPC, so the field starts
  // blank on every load (same pattern as the Google client secret).
  const [kimiKeyDraft, setKimiKeyDraft] = useState('')
  const [kimiKeyBusy, setKimiKeyBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.kimiAuth.getStatus().then((s) => {
      if (!cancelled) setKimiAccount({ loggedIn: s.loggedIn, apiKeyStored: s.apiKeyStored })
    })
    const offChanged = window.api.kimiAuth.onChanged((d) => {
      setKimiAccount({ loggedIn: d.loggedIn, apiKeyStored: d.apiKeyStored })
      setKimiMode('idle')
      setKimiPending(null)
      setKimiError('')
    })
    const offPending = window.api.kimiAuth.onPending((d) => {
      setKimiPending(d)
      setKimiMode('pending')
      setKimiError('')
    })
    return () => { cancelled = true; offChanged(); offPending() }
  }, [])

  async function kimiSignIn(): Promise<void> {
    setKimiError('')
    setKimiMode('pending')
    try {
      await window.api.kimiAuth.login()
    } catch (e) {
      setKimiError(e instanceof Error ? e.message : 'Sign-in failed')
      setKimiMode('idle')
      setKimiPending(null)
    }
  }

  async function kimiCancel(): Promise<void> {
    try { await window.api.kimiAuth.cancel() } catch { /* ignore */ }
    setKimiMode('idle')
    setKimiPending(null)
  }

  async function kimiSignOut(): Promise<void> {
    try { await window.api.kimiAuth.logout() } catch { /* ignore */ }
  }

  // Flip auth method. Model choice lives in the chat composer's ModelPicker,
  // which reads the option table matching the active method.
  function kimiSetAuthMethod(method: 'oauth' | 'apikey'): void {
    void update({ kimiAuthMethod: method })
  }

  async function kimiSaveApiKey(): Promise<void> {
    const apiKey = kimiKeyDraft.trim()
    if (!apiKey) {
      setKimiError('An API key is required.')
      return
    }
    setKimiKeyBusy(true)
    setKimiError('')
    try {
      const s = await window.api.kimiAuth.saveApiKey({ apiKey })
      setKimiAccount({ loggedIn: s.loggedIn, apiKeyStored: s.apiKeyStored })
      setKimiKeyDraft('')
    } catch (e) {
      setKimiError(e instanceof Error ? e.message : 'Could not save the API key')
    } finally { setKimiKeyBusy(false) }
  }

  async function kimiClearApiKey(): Promise<void> {
    setKimiKeyBusy(true)
    setKimiError('')
    try {
      const s = await window.api.kimiAuth.clearApiKey()
      setKimiAccount({ loggedIn: s.loggedIn, apiKeyStored: s.apiKeyStored })
      setKimiKeyDraft('')
    } catch (e) {
      setKimiError(e instanceof Error ? e.message : 'Could not clear the API key')
    } finally { setKimiKeyBusy(false) }
  }

  // ── bedrock account state ──
  // No sign-in flow: Bedrock authenticates per-request with SigV4, so
  // "connecting" is just storing an AWS key pair. The drafts are write-only
  // across IPC and start blank on every load (same pattern as the Kimi key
  // and the Google client secret).
  const [bedrockCreds, setBedrockCreds] = useState<{ credentialsStored: boolean }>({
    credentialsStored: false,
  })
  const [bedrockAccessKeyDraft, setBedrockAccessKeyDraft] = useState('')
  const [bedrockSecretKeyDraft, setBedrockSecretKeyDraft] = useState('')
  const [bedrockSessionTokenDraft, setBedrockSessionTokenDraft] = useState('')
  const [bedrockBusy, setBedrockBusy] = useState(false)
  const [bedrockError, setBedrockError] = useState('')

  useEffect(() => {
    let cancelled = false
    window.api.bedrockAuth.getStatus().then((s) => {
      if (!cancelled) setBedrockCreds({ credentialsStored: s.credentialsStored })
    })
    const offChanged = window.api.bedrockAuth.onChanged((d) => {
      setBedrockCreds({ credentialsStored: d.credentialsStored })
      setBedrockError('')
    })
    return () => { cancelled = true; offChanged() }
  }, [])

  async function bedrockSaveCredentials(): Promise<void> {
    const accessKeyId = bedrockAccessKeyDraft.trim()
    const secretAccessKey = bedrockSecretKeyDraft.trim()
    if (!accessKeyId || !secretAccessKey) {
      setBedrockError('Both an access key ID and a secret access key are required.')
      return
    }
    setBedrockBusy(true)
    setBedrockError('')
    try {
      const sessionToken = bedrockSessionTokenDraft.trim()
      const s = await window.api.bedrockAuth.saveCredentials({
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      })
      setBedrockCreds({ credentialsStored: s.credentialsStored })
      setBedrockAccessKeyDraft('')
      setBedrockSecretKeyDraft('')
      setBedrockSessionTokenDraft('')
    } catch (e) {
      setBedrockError(e instanceof Error ? e.message : 'Could not save the AWS credentials')
    } finally { setBedrockBusy(false) }
  }

  async function bedrockClearCredentials(): Promise<void> {
    setBedrockBusy(true)
    setBedrockError('')
    try {
      const s = await window.api.bedrockAuth.clearCredentials()
      setBedrockCreds({ credentialsStored: s.credentialsStored })
      setBedrockAccessKeyDraft('')
      setBedrockSecretKeyDraft('')
      setBedrockSessionTokenDraft('')
    } catch (e) {
      setBedrockError(e instanceof Error ? e.message : 'Could not clear the AWS credentials')
    } finally { setBedrockBusy(false) }
  }

  // ── google account state ──
  // Lives on the Providers tab so the auth is a shared, app-wide concern.
  // The rose-contacts built-in extension consumes the status but doesn't
  // own sign-in.
  const [googleStatus, setGoogleStatus] = useState<GoogleSyncStatus | null>(null)
  const [googleBusy, setGoogleBusy] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  // Local-only draft for the BYO OAuth pair. The clientSecret is never read
  // back from the main process (safeStorage is one-way for our purposes), so
  // the field starts blank on every load — the user re-enters it only when
  // changing or re-pasting credentials.
  const [googleClientIdDraft, setGoogleClientIdDraft] = useState('')
  const [googleClientSecretDraft, setGoogleClientSecretDraft] = useState('')
  const [googleHelpOpen, setGoogleHelpOpen] = useState(false)

  const refreshGoogleStatus = useCallback(async () => {
    const s = await window.api.contacts.googleGetStatus()
    setGoogleStatus(s)
  }, [])

  useEffect(() => { void refreshGoogleStatus() }, [refreshGoogleStatus])

  async function googleSignIn(): Promise<void> {
    setGoogleBusy('Opening Google sign-in…')
    setGoogleError(null)
    try {
      const s = await window.api.contacts.googleSignIn()
      setGoogleStatus(s)
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally { setGoogleBusy(null) }
  }

  async function googleSignOut(): Promise<void> {
    setGoogleBusy('Signing out…')
    try {
      const s = await window.api.contacts.googleSignOut()
      setGoogleStatus(s)
    } finally { setGoogleBusy(null) }
  }

  async function googleSaveCredentials(): Promise<void> {
    const clientId = googleClientIdDraft.trim()
    const clientSecret = googleClientSecretDraft.trim()
    if (!clientId || !clientSecret) {
      setGoogleError('Both client ID and client secret are required.')
      return
    }
    setGoogleBusy('Saving credentials…')
    setGoogleError(null)
    try {
      const s = await window.api.contacts.googleSaveCredentials({ clientId, clientSecret })
      setGoogleStatus(s)
      setGoogleClientIdDraft('')
      setGoogleClientSecretDraft('')
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : 'Could not save credentials')
    } finally { setGoogleBusy(null) }
  }

  async function googleClearCredentials(): Promise<void> {
    setGoogleBusy('Clearing credentials…')
    setGoogleError(null)
    try {
      const s = await window.api.contacts.googleClearCredentials()
      setGoogleStatus(s)
      setGoogleClientIdDraft('')
      setGoogleClientSecretDraft('')
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : 'Could not clear credentials')
    } finally { setGoogleBusy(null) }
  }

  // ── BYO web-search provider (search_web tool) ──
  // Same shape as the Google BYO pair: the provider choice is readable, the
  // API key is write-only (safeStorage) so the field starts blank every load.
  const [searchStatus, setSearchStatus] = useState<{ provider: 'brave' | 'tavily' | 'browserbase' | null; keyStored: boolean } | null>(null)
  const [searchProviderDraft, setSearchProviderDraft] = useState<'brave' | 'tavily' | 'browserbase'>('brave')
  const [searchKeyDraft, setSearchKeyDraft] = useState('')
  const [searchBusy, setSearchBusy] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const refreshSearchStatus = useCallback(async () => {
    const s = await window.api.searchProvider.getStatus()
    setSearchStatus(s)
    if (s.provider) setSearchProviderDraft(s.provider)
  }, [])

  useEffect(() => { void refreshSearchStatus() }, [refreshSearchStatus])

  async function searchSaveCredentials(): Promise<void> {
    const apiKey = searchKeyDraft.trim()
    if (!apiKey) {
      setSearchError('An API key is required.')
      return
    }
    setSearchBusy('Saving…')
    setSearchError(null)
    try {
      const s = await window.api.searchProvider.saveCredentials({ provider: searchProviderDraft, apiKey })
      setSearchStatus(s)
      setSearchKeyDraft('')
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Could not save the API key')
    } finally { setSearchBusy(null) }
  }

  async function searchClearCredentials(): Promise<void> {
    setSearchBusy('Clearing…')
    setSearchError(null)
    try {
      const s = await window.api.searchProvider.clearCredentials()
      setSearchStatus(s)
      setSearchKeyDraft('')
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Could not clear the API key')
    } finally { setSearchBusy(null) }
  }

  // ── Doppler import ──
  // One-shot: token is held in renderer state only for the fetch/apply calls
  // and never persisted anywhere. Preview values arrive masked.
  interface DopplerCandidate {
    target:
      | 'search-brave'
      | 'search-tavily'
      | 'search-browserbase'
      | 'kimi-apikey'
      | 'google-oauth'
      | 'bedrock-aws'
    label: string
    secretName: string
    maskedValue: string
  }
  // The search targets all write to the same single-provider slot, so at most
  // one may be selected at a time.
  const DOPPLER_SEARCH_TARGETS = ['search-brave', 'search-tavily', 'search-browserbase']
  const [dopplerToken, setDopplerToken] = useState('')
  const [dopplerProject, setDopplerProject] = useState('')
  const [dopplerConfig, setDopplerConfig] = useState('')
  const [dopplerBusy, setDopplerBusy] = useState<'fetch' | 'apply' | null>(null)
  const [dopplerError, setDopplerError] = useState('')
  const [dopplerFound, setDopplerFound] = useState<{ candidates: DopplerCandidate[]; totalSecrets: number } | null>(null)
  const [dopplerSelected, setDopplerSelected] = useState<Set<string>>(new Set())
  const [dopplerApplied, setDopplerApplied] = useState<string[]>([])

  // Sign-in state for the Doppler device flow (same shape as the Kimi flow).
  const [dopplerAuthed, setDopplerAuthed] = useState(false)
  const [dopplerAuthMode, setDopplerAuthMode] = useState<'idle' | 'pending'>('idle')
  const [dopplerPendingAuth, setDopplerPendingAuth] = useState<{ url: string; userCode: string } | null>(null)
  // Workplace-scoped tokens need an explicit project + config; enumerated
  // after sign-in so the user picks from dropdowns instead of typing slugs.
  const [dopplerProjects, setDopplerProjects] = useState<string[]>([])
  const [dopplerConfigs, setDopplerConfigs] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    window.api.doppler.getStatus().then((s) => { if (!cancelled) setDopplerAuthed(s.loggedIn) }).catch(() => {})
    const offChanged = window.api.doppler.onChanged((d) => {
      setDopplerAuthed(d.loggedIn)
      setDopplerAuthMode('idle')
      setDopplerPendingAuth(null)
      setDopplerError('')
      if (!d.loggedIn) {
        setDopplerProjects([])
        setDopplerConfigs([])
        setDopplerProject('')
        setDopplerConfig('')
      }
    })
    const offPending = window.api.doppler.onPending((d) => {
      setDopplerPendingAuth(d)
      setDopplerAuthMode('pending')
      setDopplerError('')
    })
    return () => { cancelled = true; offChanged(); offPending() }
  }, [])

  // Signed in → enumerate projects; project picked → enumerate its configs.
  useEffect(() => {
    if (!dopplerAuthed) return
    let cancelled = false
    window.api.doppler.listProjects()
      .then((projects) => { if (!cancelled) setDopplerProjects(projects) })
      .catch((e) => { if (!cancelled) setDopplerError(e instanceof Error ? e.message : 'Could not list Doppler projects') })
    return () => { cancelled = true }
  }, [dopplerAuthed])

  useEffect(() => {
    if (!dopplerAuthed || !dopplerProject) {
      setDopplerConfigs([])
      return
    }
    let cancelled = false
    window.api.doppler.listConfigs(dopplerProject)
      .then((configs) => {
        if (cancelled) return
        setDopplerConfigs(configs)
        if (configs.length > 0 && !configs.includes(dopplerConfig)) setDopplerConfig(configs[0])
      })
      .catch((e) => { if (!cancelled) setDopplerError(e instanceof Error ? e.message : 'Could not list Doppler configs') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dopplerAuthed, dopplerProject])

  async function dopplerLogin(): Promise<void> {
    setDopplerError('')
    setDopplerAuthMode('pending')
    try {
      await window.api.doppler.login()
    } catch (e) {
      setDopplerError(e instanceof Error ? e.message : 'Sign-in failed')
      setDopplerAuthMode('idle')
      setDopplerPendingAuth(null)
    }
  }

  async function dopplerCancelLogin(): Promise<void> {
    try { await window.api.doppler.cancel() } catch { /* ignore */ }
    setDopplerAuthMode('idle')
    setDopplerPendingAuth(null)
  }

  async function dopplerLogout(): Promise<void> {
    try { await window.api.doppler.logout() } catch { /* ignore */ }
  }

  function dopplerAccess(): { token?: string; project?: string; config?: string } {
    return {
      // A typed token always wins; otherwise the stored sign-in token is
      // used main-side and we only send the project/config scope.
      ...(dopplerToken.trim() ? { token: dopplerToken.trim() } : {}),
      ...(dopplerProject.trim() ? { project: dopplerProject.trim() } : {}),
      ...(dopplerConfig.trim() ? { config: dopplerConfig.trim() } : {})
    }
  }

  const dopplerCanFetch = dopplerToken.trim().length > 0 ||
    (dopplerAuthed && dopplerProject.trim().length > 0 && dopplerConfig.trim().length > 0)

  async function dopplerFetch(): Promise<void> {
    setDopplerBusy('fetch')
    setDopplerError('')
    setDopplerApplied([])
    try {
      const preview = await window.api.doppler.preview(dopplerAccess())
      setDopplerFound(preview)
      // Pre-select everything usable; when several search providers are
      // present only one can be active — keep the first found (Brave >
      // Tavily > Browserbase) and let the user flip it.
      const initial = new Set(preview.candidates.map((c) => c.target as string))
      const searchHits = DOPPLER_SEARCH_TARGETS.filter((t) => initial.has(t))
      for (const t of searchHits.slice(1)) initial.delete(t)
      setDopplerSelected(initial)
    } catch (e) {
      setDopplerFound(null)
      setDopplerError(e instanceof Error ? e.message : 'Could not fetch secrets from Doppler')
    } finally { setDopplerBusy(null) }
  }

  function dopplerToggle(target: string): void {
    setDopplerSelected((prev) => {
      const next = new Set(prev)
      if (next.has(target)) {
        next.delete(target)
      } else {
        if (DOPPLER_SEARCH_TARGETS.includes(target)) {
          for (const t of DOPPLER_SEARCH_TARGETS) next.delete(t)
        }
        next.add(target)
      }
      return next
    })
  }

  async function dopplerImport(): Promise<void> {
    setDopplerBusy('apply')
    setDopplerError('')
    try {
      const result = await window.api.doppler.apply({
        access: dopplerAccess(),
        targets: [...dopplerSelected] as DopplerCandidate['target'][]
      })
      setDopplerApplied(result.applied.map((a) => a.detail))
      setDopplerFound(null)
      setDopplerSelected(new Set())
      // Imported credentials land in the other cards — refresh their status.
      void refreshSearchStatus()
      void refreshGoogleStatus()
      window.api.kimiAuth.getStatus().then((s) => setKimiAccount({ loggedIn: s.loggedIn, apiKeyStored: s.apiKeyStored })).catch(() => {})
      void useSettingsStore.getState().load()
    } catch (e) {
      setDopplerError(e instanceof Error ? e.message : 'Import failed')
    } finally { setDopplerBusy(null) }
  }

  // ── whisper model install modal ──
  const preloadModelId = useWhisperPreloadStore((s) => s.modelId)
  const preloadStatus = useWhisperPreloadStore((s) => s.status)
  const preloadPercent = useWhisperPreloadStore((s) => s.percent)
  const initPreload = useWhisperPreloadStore((s) => s.init)
  const startPreload = useWhisperPreloadStore((s) => s.start)
  const clearPreload = useWhisperPreloadStore((s) => s.clear)
  const [pendingWhisperModel, setPendingWhisperModel] = useState<WhisperModelOption | null>(null)
  const [installModalOpen, setInstallModalOpen] = useState(false)

  useEffect(() => { void initPreload() }, [initPreload])

  const activeWhisperOption = WHISPER_MODEL_OPTIONS.find((o) => o.id === preloadModelId) ?? null
  const installInFlight =
    activeWhisperOption !== null &&
    (preloadStatus === 'preparing' || preloadStatus === 'downloading')

  // Commits a finished install to the saved setting. Handles the case where
  // the user backgrounded the modal (or navigated away) before completion.
  useEffect(() => {
    if (preloadStatus === 'ready' && preloadModelId && preloadModelId !== whisperModel) {
      update({ whisperModel: preloadModelId })
      void clearPreload()
      setInstallModalOpen(false)
      setPendingWhisperModel(null)
    }
  }, [preloadStatus, preloadModelId, whisperModel, update, clearPreload])

  function handleWhisperModelChange(newId: string): void {
    if (newId === whisperModel) return
    const target = WHISPER_MODEL_OPTIONS.find((o) => o.id === newId)
    if (!target) return
    setPendingWhisperModel(target)
    setInstallModalOpen(true)
  }

  async function handleWhisperInstallConfirm(): Promise<void> {
    if (!pendingWhisperModel) return
    await startPreload(pendingWhisperModel.id)
    // start() resolves once the pipeline is loaded; the auto-commit effect
    // above promotes status==='ready' into a saved setting + cleared store.
  }

  function handleWhisperInstallCancel(): void {
    setInstallModalOpen(false)
    setPendingWhisperModel(null)
    if (preloadStatus === 'idle' || preloadStatus === 'error') {
      void clearPreload()
    }
  }

  function handleWhisperInstallHide(): void {
    setInstallModalOpen(false)
    // pendingWhisperModel stays so the dropdown still shows the in-flight pick.
  }

  function handleWhisperInstallComplete(): void {
    const target = pendingWhisperModel ?? activeWhisperOption
    if (target) update({ whisperModel: target.id })
    setInstallModalOpen(false)
    setPendingWhisperModel(null)
    void clearPreload()
  }

  function reopenInstallModal(): void {
    const target = pendingWhisperModel ?? activeWhisperOption
    if (target) {
      setPendingWhisperModel(target)
      setInstallModalOpen(true)
    }
  }

  // ── TTS state ─────────────────────────────────────────────
  // Voice catalog mirrored from huggingface.co/rhasspy/piper-voices' canonical
  // voices.json — ~100 voices across many languages. We fetch on General tab
  // open, re-fetch after each download, and offer a manual refresh button.
  interface TtsCatalogRow {
    id: string
    speakerName: string
    displayName: string
    languageCode: string
    languageFamily: string
    languageEnglish: string
    languageNative: string
    country: string
    quality: 'x_low' | 'low' | 'medium' | 'high'
    approxSizeMB: number
    parentId: string | null
    speakerKey: string | null
    speakerIndex: number | null
    totalSpeakers: number
    installed: boolean
  }
  const [ttsCatalog, setTtsCatalog] = useState<TtsCatalogRow[]>([])
  const [ttsProgress, setTtsProgress] = useState<Record<string, { percent: number; status: 'preparing' | 'downloading' | 'ready' | 'error'; error?: string }>>({})
  const [ttsVoiceMenuOpen, setTtsVoiceMenuOpen] = useState(false)
  const [ttsBusyToggle, setTtsBusyToggle] = useState(false)
  const [ttsSearchQuery, setTtsSearchQuery] = useState('')
  const [ttsLanguageFilter, setTtsLanguageFilter] = useState<string>('all')
  const [ttsQualityFilter, setTtsQualityFilter] = useState<'all' | 'x_low' | 'low' | 'medium' | 'high'>('all')
  const [ttsRefreshing, setTtsRefreshing] = useState(false)

  const reloadTtsCatalog = useCallback(async () => {
    try {
      const list = await window.api.tts.listVoices() as TtsCatalogRow[]
      setTtsCatalog(list)
    } catch { /* engine unavailable yet — empty list is fine */ }
  }, [])

  async function handleRefreshTtsCatalog(): Promise<void> {
    setTtsRefreshing(true)
    try {
      const result = await window.api.tts.refreshCatalog()
      await reloadTtsCatalog()
      useStatusStore.getState().notify(`Voice catalog refreshed (${result.count} voices)`, { tone: 'success' })
    } catch (err) {
      useStatusStore.getState().notify(
        `Catalog refresh failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        { tone: 'error' }
      )
    } finally {
      setTtsRefreshing(false)
    }
  }

  useEffect(() => {
    if (activePage !== 'general') return
    reloadTtsCatalog()
  }, [activePage, reloadTtsCatalog])

  useEffect(() => {
    const off = window.api.tts.onDownloadProgress((p) => {
      setTtsProgress((prev) => ({
        ...prev,
        [p.voiceId]: { percent: p.percent, status: p.status, error: p.error }
      }))
      if (p.status === 'ready') {
        reloadTtsCatalog()
        useStatusStore.getState().notify(`Voice ready (${p.voiceId})`, { tone: 'success' })
        // Clear progress after a beat so the row stops showing the bar.
        setTimeout(() => {
          setTtsProgress((prev) => { const n = { ...prev }; delete n[p.voiceId]; return n })
        }, 1200)
      } else if (p.status === 'error') {
        useStatusStore.getState().notify(`TTS download failed: ${p.error ?? 'unknown error'}`, { tone: 'error' })
      }
    })
    return off
  }, [reloadTtsCatalog])

  const ttsInstalledVoices = ttsCatalog.filter((v) => v.installed)
  const ttsCurrentVoiceRow = ttsCatalog.find((v) => v.id === tts.voice) ?? null
  const ttsHasAnyInstalled = ttsInstalledVoices.length > 0

  // Unique language families present in the catalog, with a representative
  // english label, for the language-filter dropdown. Sorted by english label.
  const ttsLanguageOptions = (() => {
    const map = new Map<string, string>()
    for (const v of ttsCatalog) {
      if (!map.has(v.languageFamily)) map.set(v.languageFamily, v.languageEnglish)
    }
    return Array.from(map.entries())
      .map(([family, english]) => ({ family, english }))
      .sort((a, b) => a.english.localeCompare(b.english))
  })()

  // Filter pipeline: language family → quality → free-text search across
  // speaker name, language code, english/native language, country, voice id.
  // Cheap for ~100 entries; no debounce or memoization needed.
  const ttsFilteredCatalog = (() => {
    const q = ttsSearchQuery.trim().toLowerCase()
    return ttsCatalog.filter((v) => {
      if (ttsLanguageFilter !== 'all' && v.languageFamily !== ttsLanguageFilter) return false
      if (ttsQualityFilter !== 'all' && v.quality !== ttsQualityFilter) return false
      if (!q) return true
      const hay = [
        v.speakerName, v.languageCode, v.languageEnglish, v.languageNative,
        v.country, v.id, v.quality
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  })()
  const ttsCatalogCount = ttsCatalog.length
  const ttsFilteredCount = ttsFilteredCatalog.length
  // Soft-cap rendered rows: libritts alone can contribute hundreds of
  // speakers, and mounting that many DOM nodes inside a 360px scroll
  // container chokes the UI. The user has search + filters to narrow.
  const TTS_VISIBLE_LIMIT = 200
  const ttsVisibleCatalog = ttsFilteredCatalog.slice(0, TTS_VISIBLE_LIMIT)
  const ttsHiddenCount = Math.max(0, ttsFilteredCount - TTS_VISIBLE_LIMIT)

  async function handleTtsToggle(next: boolean): Promise<void> {
    if (!next) {
      // Stop any current playback and clear in-flight synth before flipping off
      try { await window.api.tts.cancelAll() } catch { /* ignore */ }
      await update({ tts: { ...tts, enabled: false } })
      return
    }
    // Turning on: if neither the engine nor the configured voice is installed,
    // kick off the download. We optimistically flip the toggle so the user
    // gets immediate feedback; if the download fails we flip it back.
    setTtsBusyToggle(true)
    try {
      await update({ tts: { ...tts, enabled: true } })
      if (!ttsCurrentVoiceRow?.installed) {
        useStatusStore.getState().notify(
          `Installing TTS voice (${ttsCurrentVoiceRow?.displayName ?? tts.voice})…`,
          { tone: 'info' }
        )
        await window.api.tts.downloadVoice(tts.voice)
      }
    } catch (err) {
      useStatusStore.getState().notify(
        `TTS install failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        { tone: 'error' }
      )
      await update({ tts: { ...tts, enabled: false } })
    } finally {
      setTtsBusyToggle(false)
    }
  }

  async function handleDownloadVoice(voiceId: string): Promise<void> {
    try {
      await window.api.tts.downloadVoice(voiceId)
    } catch (err) {
      useStatusStore.getState().notify(
        `Download failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        { tone: 'error' }
      )
    }
  }

  async function handleUninstallVoice(voiceId: string): Promise<void> {
    // Multi-speaker voices share their model files — removing any one
    // sibling un-installs them all. Guard against pulling the rug out from
    // under whichever sibling is currently selected.
    const row = ttsCatalog.find((x) => x.id === voiceId)
    const targetModelId = row?.parentId ?? row?.id ?? voiceId
    const activeRow = ttsCatalog.find((x) => x.id === tts.voice)
    const activeModelId = activeRow?.parentId ?? activeRow?.id ?? tts.voice
    if (targetModelId === activeModelId) {
      useStatusStore.getState().notify('Can\'t remove the active voice — switch first.', { tone: 'info' })
      return
    }
    await window.api.tts.uninstallVoice(voiceId)
    await reloadTtsCatalog()
  }

  async function handleSelectVoice(voiceId: string): Promise<void> {
    await update({ tts: { ...tts, voice: voiceId } })
    setTtsVoiceMenuOpen(false)
  }

  async function handleSpeedChange(speed: number): Promise<void> {
    const clamped = Math.max(0.5, Math.min(2.0, speed))
    await update({ tts: { ...tts, speed: clamped } })
  }

  // ── skills ──
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])

  const reloadSkills = useCallback(() => {
    if (!rootPath) return
    window.api.skills.list(rootPath).then(setSkills).catch(() => {})
  }, [rootPath])

  useEffect(() => { reloadSkills() }, [reloadSkills])

  const uploadSkill = useCallback(async () => {
    if (!rootPath) return
    const result = await window.api.skills.upload(rootPath)
    if (result.ok && result.skills) setSkills(result.skills)
  }, [rootPath])

  const deleteSkill = useCallback(async (name: string) => {
    if (!rootPath) return
    await window.api.skills.delete(rootPath, name)
    setSkills((prev) => prev.filter((s) => s.name !== name))
  }, [rootPath])

  // ── tools ──
  const reloadTools = useCallback(() => {
    if (!rootPath) return
    Promise.all([
      window.api.tools.list(rootPath),
      window.api.project.getSettings(rootPath),
    ]).then(([tools, settings]) => {
      setAvailableTools(tools)
      setDisabledTools(settings.disabledTools)
    }).catch(() => {})
  }, [rootPath])

  useEffect(() => { reloadTools() }, [reloadTools])
  useEffect(() => subscribeToExtensionsChange(reloadTools), [reloadTools])

  const toggleTool = useCallback(async (name: string) => {
    if (!rootPath) return
    const updated = disabledTools.includes(name)
      ? disabledTools.filter((n) => n !== name)
      : [...disabledTools, name]
    setDisabledTools(updated)
    await window.api.project.setSettings(rootPath, { disabledTools: updated })
  }, [rootPath, disabledTools])

  // ── audio ──
  const loadAudioDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()))
    } catch { /* permission denied */ }
    const devices = await navigator.mediaDevices.enumerateDevices()
    setAudioDevices(
      devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
    )
  }, [])

  useEffect(() => { loadAudioDevices() }, [loadAudioDevices])

  // ── model fetch helpers ──
  const fetchOllamaModels = useCallback(async (key: string, baseUrl: string) => {
    const url = (baseUrl || 'http://localhost:11434').replace(/\/$/, '')
    setOllamaFetching((prev) => ({ ...prev, [key]: true }))
    try {
      const res = await fetch(`${url}/api/tags`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { models: { name: string }[] }
      setOllamaModels((prev) => ({ ...prev, [key]: data.models.map((m) => m.name) }))
    } catch {
      setOllamaModels((prev) => ({ ...prev, [key]: [] }))
    } finally {
      setOllamaFetching((prev) => { const n = { ...prev }; delete n[key]; return n })
    }
  }, [])

  useEffect(() => {
    if (activePage !== 'providers') return
    if (ollamaBaseUrl && !('__ollama_provider__' in ollamaModels)) {
      fetchOllamaModels('__ollama_provider__', ollamaBaseUrl)
    }
  }, [activePage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────
  // Provider helpers
  // ─────────────────────────────────────────────────────────

  function getProviderFields(kind: string): Record<string, string> {
    switch (kind) {
      case 'ollama':      return { baseUrl: ollamaBaseUrl }
      case 'projectrose': return {}
      default:            return {}
    }
  }

  function getProviderStatus(kind: string): ProviderStatus {
    if (kind === 'projectrose') return prAccount.loggedIn ? 'connected' : 'missing'
    if (kind === 'kimi') {
      return kimiAuthMethod === 'apikey'
        ? kimiAccount.apiKeyStored ? 'connected' : 'missing'
        : kimiAccount.loggedIn ? 'connected' : 'missing'
    }
    // 'connected' here means "keys are stored", not "keys are valid" — the
    // only way to prove validity is a signed call, which VERIFY does (and
    // which then lands in testedProviders, taking priority below).
    if (kind === 'bedrock') {
      if (testedProviders[kind] === 'error') return 'error'
      if (!bedrockCreds.credentialsStored) return 'missing'
      return testedProviders[kind] === 'connected' ? 'connected' : 'unverified'
    }
    if (testedProviders[kind] === 'connected') return 'connected'
    if (testedProviders[kind] === 'error') return 'error'
    const fields = getProviderFields(kind)
    const hasContent = Object.values(fields).some((v) => v && v !== '')
    return hasContent ? 'unverified' : 'missing'
  }

  function handleProviderFieldChange(kind: string, _key: string, value: string): void {
    setTestedProviders((prev) => { const n = { ...prev }; delete n[kind]; return n })
    if (kind === 'ollama') update({ ollamaBaseUrl: value })
  }

  function clearProvider(kind: string): void {
    setTestedProviders((prev) => { const n = { ...prev }; delete n[kind]; return n })
    if (kind === 'ollama') update({ ollamaBaseUrl: '' })
  }

  async function verifyProvider(kind: string): Promise<void> {
    setProviderTesting((prev) => ({ ...prev, [kind]: true }))
    try {
      let ok = false
      if (kind === 'ollama') {
        const url = (ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')
        const res = await fetch(`${url}/api/tags`)
        ok = res.ok
        if (ok) fetchOllamaModels('__ollama_provider__', ollamaBaseUrl)
      } else if (kind === 'bedrock') {
        // Listing models is the cheapest call that actually exercises the
        // SigV4 signature, the region, and the IAM policy. It runs in main —
        // the renderer has no credentials to sign with. Refresh the picker's
        // list off the same call so a successful verify populates it.
        setBedrockError('')
        try {
          await useProviderStore.getState().refreshBedrockModels()
          const err = useProviderStore.getState().bedrockModelsError
          ok = !err
          if (err) setBedrockError(err)
        } catch (e) {
          setBedrockError(e instanceof Error ? e.message : 'Could not reach Bedrock')
        }
      }
      setTestedProviders((prev) => ({ ...prev, [kind]: ok ? 'connected' : 'error' }))
    } catch {
      setTestedProviders((prev) => ({ ...prev, [kind]: 'error' }))
    } finally {
      setProviderTesting((prev) => { const n = { ...prev }; delete n[kind]; return n })
    }
  }

  // ─────────────────────────────────────────────────────────
  // Sidebar items
  // ─────────────────────────────────────────────────────────

  const topLevelItems = [
    { id: 'general',    label: 'General',    n: '01' },
    { id: 'providers',  label: 'Providers',  n: '02' },
    { id: 'tools',      label: 'Tools',      n: '03' },
    { id: 'skills',     label: 'Skills',     n: '04' },
    { id: 'prompts',    label: 'Prompts',    n: '05' },
    { id: 'extensions', label: 'Extensions', n: '06' },
    { id: 'updates',    label: 'Updates',    n: '07' },
  ]

  const allPageIds = topLevelItems.map((i) => i.id)

  useEffect(() => {
    if (!allPageIds.includes(activePage)) {
      setActivePage('general')
    }
  }, [allPageIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const settingsTarget = useViewStore((s) => s.settingsTarget)
  const setSettingsTarget = useViewStore((s) => s.setSettingsTarget)
  useEffect(() => {
    if (settingsTarget && allPageIds.includes(settingsTarget)) {
      setActivePage(settingsTarget)
      setSettingsTarget(null)
    }
  }, [settingsTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────
  // Render: General
  // ─────────────────────────────────────────────────────────

  function renderGeneral(): JSX.Element {
    return (
      <>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Names</div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Your Name</div>
              <div className={styles.settingDesc}>Used to identify your voice in the live transcript.</div>
            </div>
            <input
              className={styles.input}
              type="text"
              value={userName}
              placeholder="e.g. Andrew"
              onChange={(e) => update({ userName: e.target.value })}
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Agent Name</div>
              <div className={styles.settingDesc}>Wake word — say this name to start drafting a message.</div>
            </div>
            <input
              className={styles.input}
              type="text"
              value={agentName}
              placeholder="e.g. Rose"
              onChange={(e) => update({ agentName: e.target.value })}
            />
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 16 }}>
          <div className={styles.sectionTitle}>Microphone and Speaker</div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Microphone</div>
              <div className={styles.settingDesc}>Which microphone to use for voice-to-text.</div>
            </div>
            <select
              className={styles.select}
              value={micDeviceId}
              onChange={(e) => update({ micDeviceId: e.target.value })}
            >
              <option value="">System default</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Auto-send delay</div>
              <div className={styles.settingDesc}>
                Seconds of silence after the wake word before the draft is sent. Raise this if you tend to pause mid-sentence; lower it for snappier replies.
              </div>
            </div>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={60}
              step={1}
              value={activeListeningDraftSeconds}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 1 && n <= 60) {
                  update({ activeListeningDraftSeconds: Math.round(n) })
                }
              }}
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Speech-to-text model</div>
              <div className={styles.settingDesc}>
                Larger models transcribe more accurately but use more CPU. The model is downloaded once when you pick it (~40 MB to ~1.5 GB depending on size) and cached on disk after.
              </div>
              {installInFlight && !installModalOpen && activeWhisperOption && (
                <button
                  type="button"
                  className={whisperModalStyles.pill}
                  onClick={reopenInstallModal}
                  title="Show install progress"
                >
                  <span className={whisperModalStyles.pillDot} />
                  Installing {activeWhisperOption.label} · {preloadPercent.toFixed(0)}%
                </button>
              )}
            </div>
            <select
              className={styles.select}
              value={pendingWhisperModel?.id ?? whisperModel}
              disabled={installInFlight}
              onChange={(e) => handleWhisperModelChange(e.target.value)}
            >
              {WHISPER_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} · ~{opt.size}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 16 }}>
          <div className={styles.sectionTitle}>Text-to-Speech</div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Read agent responses aloud</div>
              <div className={styles.settingDesc}>
                Speaks each completed assistant message through your speakers using Piper, an on-device neural voice. The first time you turn this on, the engine plus the default voice ({ttsCurrentVoiceRow?.approxSizeMB ?? 63} MB) download to your machine and stay cached. Nothing is sent to a server.
              </div>
            </div>
            <HToggle
              on={tts.enabled}
              onChange={(v) => { void handleTtsToggle(v) }}
            />
          </div>
          {tts.enabled && (
            <>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>Voice</div>
                  <div className={styles.settingDesc}>
                    {ttsHasAnyInstalled
                      ? 'Pick which voice to speak with. Download more from the list below.'
                      : ttsBusyToggle
                        ? 'Downloading the default voice — this can take a minute on first run.'
                        : 'No voices installed yet. The default voice will download in the background.'}
                  </div>
                </div>
                <select
                  className={styles.select}
                  value={tts.voice}
                  onChange={(e) => { void handleSelectVoice(e.target.value) }}
                >
                  {!ttsHasAnyInstalled && (
                    <option value={tts.voice}>{ttsCurrentVoiceRow?.displayName ?? tts.voice} (installing…)</option>
                  )}
                  {ttsInstalledVoices.map((v) => (
                    <option key={v.id} value={v.id}>{v.displayName}</option>
                  ))}
                </select>
              </div>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>Speed</div>
                  <div className={styles.settingDesc}>
                    Playback rate — 1.0 is natural pace, higher is faster.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={tts.speed}
                    onChange={(e) => { void handleSpeedChange(Number(e.target.value)) }}
                    style={{ width: 140 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 28, textAlign: 'right' }}>
                    {tts.speed.toFixed(2)}×
                  </span>
                </div>
              </div>
              <div className={styles.settingRow} style={{ alignItems: 'flex-start' }}>
                <div className={styles.settingInfo} style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.settingLabel}>Voice library</div>
                  <div className={styles.settingDesc}>
                    {ttsVoiceMenuOpen
                      ? `${ttsCatalogCount} voices in the Rhasspy/Piper catalog · click DOWNLOAD to install one.`
                      : 'Browse and download additional voices — every Piper voice from rhasspy/piper-voices.'}
                  </div>
                  {ttsVoiceMenuOpen && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Search voices, languages, countries…"
                          value={ttsSearchQuery}
                          onChange={(e) => setTtsSearchQuery(e.target.value)}
                          style={{ flex: '1 1 220px', minWidth: 160 }}
                        />
                        <select
                          className={styles.select}
                          value={ttsLanguageFilter}
                          onChange={(e) => setTtsLanguageFilter(e.target.value)}
                          title="Filter by language"
                        >
                          <option value="all">All languages</option>
                          {ttsLanguageOptions.map((l) => (
                            <option key={l.family} value={l.family}>{l.english} ({l.family})</option>
                          ))}
                        </select>
                        <select
                          className={styles.select}
                          value={ttsQualityFilter}
                          onChange={(e) => setTtsQualityFilter(e.target.value as typeof ttsQualityFilter)}
                          title="Filter by quality"
                        >
                          <option value="all">All qualities</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                          <option value="x_low">Extra low</option>
                        </select>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => { void handleRefreshTtsCatalog() }}
                          disabled={ttsRefreshing}
                          title="Re-fetch voices.json from Hugging Face"
                        >
                          {ttsRefreshing ? 'REFRESHING…' : '↻ REFRESH'}
                        </button>
                      </div>
                      <div style={{
                        marginTop: 8,
                        fontSize: 10,
                        letterSpacing: 1.2,
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase'
                      }}>
                        Showing {Math.min(ttsFilteredCount, TTS_VISIBLE_LIMIT)} of {ttsFilteredCount}
                        {ttsFilteredCount !== ttsCatalogCount && <> · {ttsCatalogCount} total</>}
                        {' · '}
                        {ttsInstalledVoices.length} installed
                      </div>
                      <div style={{
                        marginTop: 8,
                        border: '1px solid var(--color-bg-secondary)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        maxHeight: 360,
                        overflowY: 'auto'
                      }}>
                        {ttsFilteredCount === 0 && (
                          <div style={{
                            padding: '18px 14px',
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            fontStyle: 'italic',
                            textAlign: 'center'
                          }}>
                            No voices match — try a different search or refresh the catalog.
                          </div>
                        )}
                        {ttsVisibleCatalog.map((v, idx) => {
                          const prog = ttsProgress[v.id]
                          const busy = !!prog && (prog.status === 'preparing' || prog.status === 'downloading')
                          const isActive = v.id === tts.voice
                          const isSpeaker = v.parentId !== null
                          const isMultiSpeakerParent = v.parentId === null && v.totalSpeakers > 1
                          return (
                            <div
                              key={v.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 12px',
                                paddingLeft: isSpeaker ? 28 : 12,
                                borderTop: idx === 0 ? 'none' : '1px solid var(--color-bg-secondary)',
                                fontSize: 12,
                                background: isActive ? 'var(--color-bg-secondary)' : 'transparent'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span>{v.displayName}</span>
                                  {isActive && (
                                    <span style={{ fontSize: 9, letterSpacing: 1, color: 'var(--color-accent)' }}>· ACTIVE</span>
                                  )}
                                  {isMultiSpeakerParent && (
                                    <span style={{
                                      fontSize: 9,
                                      letterSpacing: 1,
                                      padding: '1px 6px',
                                      border: '1px solid var(--color-text-muted)',
                                      borderRadius: 2,
                                      color: 'var(--color-text-muted)'
                                    }}>
                                      MULTI
                                    </span>
                                  )}
                                  {isSpeaker && v.speakerKey && (
                                    <span style={{
                                      fontSize: 9,
                                      letterSpacing: 1,
                                      padding: '1px 6px',
                                      border: '1px solid var(--color-text-muted)',
                                      borderRadius: 2,
                                      color: 'var(--color-text-muted)'
                                    }}>
                                      SPK {v.speakerKey}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: 0.6, marginTop: 2 }}>
                                  {v.languageCode} · {v.quality.toUpperCase().replace('_', '-')} · ~{v.approxSizeMB} MB · {v.id}
                                </div>
                                {isMultiSpeakerParent && (
                                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: 0.4, marginTop: 2, fontStyle: 'italic' }}>
                                    One install unlocks all {v.totalSpeakers} speakers.
                                  </div>
                                )}
                                {busy && (
                                  <div style={{
                                    marginTop: 6,
                                    height: 4,
                                    background: 'var(--color-bg-secondary)',
                                    borderRadius: 2,
                                    overflow: 'hidden'
                                  }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${Math.max(0, Math.min(100, prog?.percent ?? 0))}%`,
                                      background: 'var(--color-accent)',
                                      transition: 'width 200ms ease'
                                    }} />
                                  </div>
                                )}
                              </div>
                              {v.installed ? (
                                <>
                                  <span style={{ fontSize: 9, color: 'var(--color-saved)', letterSpacing: 1.2 }}>INSTALLED</span>
                                  {!isActive && (
                                    <>
                                      <button
                                        type="button"
                                        className={styles.ghostBtn}
                                        onClick={() => { void handleSelectVoice(v.id) }}
                                      >
                                        USE
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.ghostBtn}
                                        onClick={() => { void handleUninstallVoice(v.id) }}
                                      >
                                        REMOVE
                                      </button>
                                    </>
                                  )}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.ghostBtn}
                                  disabled={busy}
                                  onClick={() => { void handleDownloadVoice(v.id) }}
                                >
                                  {busy ? `${(prog?.percent ?? 0).toFixed(0)}%` : 'DOWNLOAD'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {ttsHiddenCount > 0 && (
                          <div style={{
                            padding: '12px 14px',
                            borderTop: '1px solid var(--color-bg-secondary)',
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            fontStyle: 'italic',
                            textAlign: 'center'
                          }}>
                            + {ttsHiddenCount} more match — narrow your search to see them.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => setTtsVoiceMenuOpen((o) => !o)}
                >
                  {ttsVoiceMenuOpen ? 'CLOSE' : 'BROWSE'}
                </button>
              </div>
            </>
          )}
        </section>

      </>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Render: Providers (PLATES I – II)
  // ─────────────────────────────────────────────────────────

  function renderProviders(): JSX.Element {
    return (
      <>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.pageHeaderMeta}>PROJECTROSE · SETTINGS · PROVIDERS</div>
            <div className={styles.pageTitle}>
              <span className={styles.pageTitleAccent}>Providers</span>
              {' · '}
              <span className={styles.pageTitleSub}>endpoints</span>
            </div>
          </div>
          <div className={styles.pageHeaderRight}>
            <div>PLATES · I — III</div>
            <div className={styles.colophonAccent}>Rosa configurata</div>
          </div>
        </div>
        <hr className={styles.pageHeaderDivider} />

        {/* ══ PLATE I · PROVIDERS ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="I"
            title="Providers"
            sub="One drawer per provider — keys are masked and status is verified."
          />
          <div className={styles.sectionGap} />

          {PROVIDERS.map((p) => {
            const fields = getProviderFields(p.kind)
            const fieldDefs = PROVIDER_FIELD_DEFS[p.kind] ?? []
            const status = getProviderStatus(p.kind)
            const isExpanded = expandedProvider === p.kind
            const isTesting = !!providerTesting[p.kind]
            const filledCount = Object.values(fields).filter((v) => v && v !== '').length
            const totalFields = fieldDefs.length

            return (
              <div key={p.kind} className={styles.providerCard}>
                <button
                  type="button"
                  onClick={() => setExpandedProvider(isExpanded ? null : p.kind)}
                  className={styles.providerCardHeader}
                  style={{
                    borderBottom: isExpanded ? '1px solid var(--color-bg-secondary)' : 'none',
                    background: isExpanded ? 'var(--color-bg-primary)' : 'transparent',
                  }}
                >
                  <div className={styles.providerCardHeaderInner}>
                    <div className={styles.providerGlyphBox}>
                      <span className={styles.providerSpecNum}>№{p.spec}</span>
                      <ProviderGlyph kind={p.kind} size={28} />
                    </div>
                    <div className={styles.providerNameBlock}>
                      <div className={styles.providerNameRow}>
                        <span className={styles.providerName}>{p.name}</span>
                        <span className={styles.providerLatin}>{p.latin}</span>
                      </div>
                      <div className={styles.providerStatusRow}>
                        <StatusBadge state={status} />
                        <span className={styles.providerFieldInfo}>
                          {p.kind === 'projectrose'
                            ? prAccount.loggedIn
                              ? 'signed in'
                              : 'sign in to use the managed endpoint'
                            : p.kind === 'kimi'
                              ? kimiAuthMethod === 'apikey'
                                ? kimiAccount.apiKeyStored
                                  ? 'API key saved'
                                  : 'add a Kimi API key'
                                : kimiAccount.loggedIn
                                  ? 'signed in'
                                  : 'sign in with your kimi.com account'
                            : p.kind === 'bedrock'
                              ? bedrockCreds.credentialsStored
                                ? `AWS credentials saved · ${bedrockRegion}`
                                : 'add AWS credentials'
                              : status === 'connected' || status === 'unverified'
                                ? `${filledCount}/${totalFields} field${totalFields === 1 ? '' : 's'}`
                                : `${totalFields} field${totalFields === 1 ? '' : 's'} required`}
                        </span>
                      </div>
                    </div>
                    <span
                      className={styles.providerCaret}
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▸
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className={`${styles.providerCardBody} ${styles.drawerIn}`}>
                    {p.kind === 'projectrose' ? (
                      <div style={{ padding: '12px 16px 4px' }}>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
                          {prAccount.loggedIn
                            ? 'Signed in — pick ProjectRose from the model picker in the chat composer to use the managed endpoint.'
                            : 'Sign in to make the managed ProjectRose endpoint (backed by your subscription) available in the chat composer — no API keys needed.'}
                        </p>
                        {prAccount.loggedIn ? (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                              {prAccount.name || prAccount.email}
                            </div>
                            {prAccount.name && (
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                                {prAccount.email}
                              </div>
                            )}
                            <UsageBar
                              usage={prUsage}
                              loading={prUsageLoading}
                              error={prUsageError}
                              onRefresh={loadProjectRoseUsage}
                            />
                          </>
                        ) : prMode === 'pending' ? (
                          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                            Browser opened — finish authorization there.
                            {prPairingUrl && (
                              <>
                                {' '}
                                <button
                                  type="button"
                                  onClick={() => navigator.clipboard.writeText(prPairingUrl).catch(() => {})}
                                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11, fontFamily: 'inherit' }}
                                >
                                  COPY LINK
                                </button>
                              </>
                            )}
                          </p>
                        ) : null}
                        {prError && (
                          <p style={{ fontSize: 11, color: 'var(--color-error)', margin: '0 0 12px' }}>{prError}</p>
                        )}
                      </div>
                    ) : p.kind === 'kimi' ? (
                      <div style={{ padding: '12px 16px 4px' }}>
                        {/* Auth-method toggle: kimi.com OAuth vs BYO Moonshot API key */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          {([
                            { id: 'oauth' as const, label: 'KIMI.COM ACCOUNT' },
                            { id: 'apikey' as const, label: 'API KEY' },
                          ]).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className={kimiAuthMethod === m.id ? styles.primaryBtn : styles.ghostBtn}
                              style={{ flex: 1, fontSize: 10 }}
                              onClick={() => kimiSetAuthMethod(m.id)}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
                          {kimiAuthMethod === 'apikey'
                            ? kimiAccount.apiKeyStored
                              ? 'API key saved — pick a Kimi model from the model picker in the chat composer.'
                              : 'Paste a Kimi Coding key (sk-kimi-…, from kimi.com) or a Moonshot platform key (sk-…, from platform.moonshot.ai). The key type is detected automatically and routed to the right API.'
                            : kimiAccount.loggedIn
                              ? 'Signed in — pick a Kimi Code model from the model picker in the chat composer (backed by your kimi.com subscription).'
                              : 'Sign in with your kimi.com account to make Kimi Code available in the chat composer — no API keys needed.'}
                        </p>
                        {kimiAuthMethod === 'apikey' ? (
                          <FieldRow label="API KEY" hint="stored in system keychain">
                            <KeyInput
                              value={kimiKeyDraft}
                              placeholder={kimiAccount.apiKeyStored ? '••••••••  (key saved — paste to replace)' : 'sk-…'}
                              onChange={setKimiKeyDraft}
                            />
                          </FieldRow>
                        ) : kimiAccount.loggedIn ? null : kimiMode === 'pending' ? (
                          <div style={{ margin: '0 0 12px' }}>
                            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                              Browser opened — approve this device on kimi.com.
                              {kimiPending?.url && (
                                <>
                                  {' '}
                                  <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(kimiPending.url).catch(() => {})}
                                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11, fontFamily: 'inherit' }}
                                  >
                                    COPY LINK
                                  </button>
                                </>
                              )}
                            </p>
                            {kimiPending?.userCode && (
                              <p style={{ fontSize: 12, margin: 0, color: 'var(--color-text-primary)' }}>
                                Confirmation code:{' '}
                                <span style={{ fontFamily: 'inherit', letterSpacing: '0.15em', color: 'var(--color-accent)' }}>
                                  {kimiPending.userCode}
                                </span>
                              </p>
                            )}
                          </div>
                        ) : null}
                        {kimiError && (
                          <p style={{ fontSize: 11, color: 'var(--color-error)', margin: '0 0 12px' }}>{kimiError}</p>
                        )}
                      </div>
                    ) : p.kind === 'bedrock' ? (
                      <div style={{ padding: '12px 16px 4px' }}>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
                          {bedrockCreds.credentialsStored
                            ? 'AWS credentials saved — pick a Bedrock model from the model picker in the chat composer.'
                            : 'Paste an AWS access key pair for an IAM identity with bedrock:InvokeModelWithResponseStream, bedrock:ListFoundationModels, and bedrock:ListInferenceProfiles. Keys are stored in the system keychain and never leave this machine.'}
                        </p>
                        <FieldRow label="REGION" hint="model availability is region-scoped">
                          <KeyInput
                            value={bedrockRegion}
                            placeholder="us-east-1"
                            onChange={(v) => update({ bedrockRegion: v })}
                          />
                        </FieldRow>
                        <FieldRow label="ACCESS KEY ID" hint="stored in system keychain">
                          <KeyInput
                            value={bedrockAccessKeyDraft}
                            placeholder={bedrockCreds.credentialsStored ? '••••••••  (saved — paste to replace)' : 'AKIA…'}
                            onChange={setBedrockAccessKeyDraft}
                          />
                        </FieldRow>
                        <FieldRow label="SECRET ACCESS KEY" hint="stored in system keychain">
                          <KeyInput
                            value={bedrockSecretKeyDraft}
                            placeholder={bedrockCreds.credentialsStored ? '••••••••  (saved — paste to replace)' : ''}
                            type="password"
                            onChange={setBedrockSecretKeyDraft}
                          />
                        </FieldRow>
                        <FieldRow label="SESSION TOKEN" hint="only for temporary / STS credentials">
                          <KeyInput
                            value={bedrockSessionTokenDraft}
                            placeholder="optional"
                            type="password"
                            onChange={setBedrockSessionTokenDraft}
                          />
                        </FieldRow>
                        {bedrockError && (
                          <p style={{ fontSize: 11, color: 'var(--color-error)', margin: '0 0 12px' }}>{bedrockError}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {fieldDefs.map((f) => (
                          <FieldRow key={f.key} label={f.label} hint={f.hint}>
                            <KeyInput
                              value={fields[f.key] ?? ''}
                              placeholder={f.placeholder}
                              type={f.secret ? 'password' : 'text'}
                              onChange={(v) => handleProviderFieldChange(p.kind, f.key, v)}
                            />
                          </FieldRow>
                        ))}
                        {p.kind === 'ollama' && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '12px 16px 4px' }}>
                            Installed models appear in the model picker in the chat composer.
                          </p>
                        )}
                      </>
                    )}
                    {p.kind === 'projectrose' ? (
                      <div className={styles.providerCardFooter} style={{ justifyContent: 'stretch' }}>
                        {prAccount.loggedIn ? (
                          <button type="button" className={styles.ghostBtn} style={{ width: '100%' }} onClick={projectroseSignOut}>
                            SIGN OUT
                          </button>
                        ) : prMode === 'pending' ? (
                          <button type="button" className={styles.ghostBtn} style={{ width: '100%' }} onClick={projectroseCancel}>
                            CANCEL
                          </button>
                        ) : (
                          <button type="button" className={styles.primaryBtn} style={{ width: '100%' }} onClick={projectroseSignIn}>
                            SIGN IN
                          </button>
                        )}
                      </div>
                    ) : p.kind === 'kimi' ? (
                      <div className={styles.providerCardFooter} style={{ justifyContent: 'stretch' }}>
                        {kimiAuthMethod === 'apikey' ? (
                          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                            <button
                              type="button"
                              className={styles.ghostBtn}
                              style={{ flex: 1 }}
                              onClick={kimiClearApiKey}
                              disabled={!kimiAccount.apiKeyStored || kimiKeyBusy}
                              title="Wipes the saved Kimi API key."
                            >
                              CLEAR
                            </button>
                            <button
                              type="button"
                              className={styles.primaryBtn}
                              style={{ flex: 2 }}
                              onClick={kimiSaveApiKey}
                              disabled={kimiKeyDraft.trim().length === 0 || kimiKeyBusy}
                            >
                              {kimiKeyBusy ? 'SAVING…' : 'SAVE KEY'}
                            </button>
                          </div>
                        ) : kimiAccount.loggedIn ? (
                          <button type="button" className={styles.ghostBtn} style={{ width: '100%' }} onClick={kimiSignOut}>
                            SIGN OUT
                          </button>
                        ) : kimiMode === 'pending' ? (
                          <button type="button" className={styles.ghostBtn} style={{ width: '100%' }} onClick={kimiCancel}>
                            CANCEL
                          </button>
                        ) : (
                          <button type="button" className={styles.primaryBtn} style={{ width: '100%' }} onClick={kimiSignIn}>
                            SIGN IN
                          </button>
                        )}
                      </div>
                    ) : p.kind === 'bedrock' ? (
                      <div className={styles.providerCardFooter} style={{ justifyContent: 'stretch' }}>
                        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            style={{ flex: 1 }}
                            onClick={bedrockClearCredentials}
                            disabled={!bedrockCreds.credentialsStored || bedrockBusy}
                            title="Wipes the saved AWS credentials."
                          >
                            CLEAR
                          </button>
                          {/* Verify is only meaningful once keys are stored —
                              it signs a real control-plane call. With unsaved
                              drafts in the fields, SAVE takes priority. */}
                          {bedrockCreds.credentialsStored &&
                          bedrockAccessKeyDraft.trim().length === 0 &&
                          bedrockSecretKeyDraft.trim().length === 0 ? (
                            <button
                              type="button"
                              className={styles.primaryBtn}
                              style={{ flex: 2 }}
                              disabled={isTesting}
                              onClick={() => verifyProvider(p.kind)}
                            >
                              {isTesting ? 'TESTING…' : status === 'connected' ? '↻ TEST AGAIN' : 'VERIFY'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.primaryBtn}
                              style={{ flex: 2 }}
                              onClick={bedrockSaveCredentials}
                              disabled={
                                bedrockAccessKeyDraft.trim().length === 0 ||
                                bedrockSecretKeyDraft.trim().length === 0 ||
                                bedrockBusy
                              }
                            >
                              {bedrockBusy ? 'SAVING…' : 'SAVE CREDENTIALS'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.providerCardFooter}>
                        <div className={styles.providerFooterBtns}>
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() => clearProvider(p.kind)}
                          >
                            CLEAR
                          </button>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            disabled={filledCount < totalFields || isTesting}
                            onClick={() => verifyProvider(p.kind)}
                          >
                            {isTesting ? 'TESTING…' : status === 'connected' ? '↻ TEST AGAIN' : 'VERIFY & SAVE'}
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ══ PLATE II · CONNECTED ACCOUNTS ══ */}
        {/* External identities the app can read/write on the user's behalf.
            Lives here (not inside Memory or Contacts) because the auth is a
            shared, app-wide concern — features in other tabs consume the
            signed-in state rather than each owning their own sign-in. */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="II"
            title="Connected Accounts"
            sub="Third-party services the agent can read or write on your behalf."
          />
          <div className={styles.sectionGap} />

          {(() => {
            const kind = 'google'
            const name = 'Google'
            const latin = 'Rosa connexa'
            const spec = 'G1'
            const isExpanded = expandedProvider === kind
            const signedIn = googleStatus?.signedIn ?? false
            const accountEmail = googleStatus?.accountEmail ?? null
            const credsConfigured = googleStatus?.credentialsConfigured ?? false
            // This build ships its own Google OAuth pair (ADR 0009 amendment):
            // it always wins over user-supplied creds, so we hide the BYO inputs,
            // the "how do I get these?" help, and the SAVE/CLEAR actions.
            const credsBundled = googleStatus?.credentialsBundled ?? false
            const status: ProviderStatus =
              signedIn ? 'connected' : credsConfigured ? 'unverified' : 'missing'
            const draftReady =
              googleClientIdDraft.trim().length > 0 && googleClientSecretDraft.trim().length > 0

            return (
              <div className={styles.providerCard}>
                <button
                  type="button"
                  onClick={() => setExpandedProvider(isExpanded ? null : kind)}
                  className={styles.providerCardHeader}
                  style={{
                    borderBottom: isExpanded ? '1px solid var(--color-bg-secondary)' : 'none',
                    background: isExpanded ? 'var(--color-bg-primary)' : 'transparent',
                  }}
                >
                  <div className={styles.providerCardHeaderInner}>
                    <div className={styles.providerGlyphBox}>
                      <span className={styles.providerSpecNum}>№{spec}</span>
                      <ProviderGlyph kind={kind} size={28} />
                    </div>
                    <div className={styles.providerNameBlock}>
                      <div className={styles.providerNameRow}>
                        <span className={styles.providerName}>{name}</span>
                        <span className={styles.providerLatin}>{latin}</span>
                      </div>
                      <div className={styles.providerStatusRow}>
                        <StatusBadge state={status} />
                        <span className={styles.providerFieldInfo}>
                          {signedIn
                            ? `signed in${accountEmail ? ` · ${accountEmail}` : ''}`
                            : credsBundled
                              ? 'sign in to enable Google features'
                              : credsConfigured
                                ? 'sign in to enable Contacts sync'
                                : 'paste OAuth credentials to enable'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={styles.providerCaret}
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▸
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className={`${styles.providerCardBody} ${styles.drawerIn}`}>
                    <div style={{ padding: '12px 16px 4px' }}>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
                        {credsBundled
                          ? (signedIn
                            ? 'Active — features that consume Google (currently Settings → Contacts > sync) will use this account.'
                            : 'This build ships with Google credentials, so there is nothing to set up. Just sign in below to enable Google features (Contacts sync today, Gmail/Calendar/Drive later).')
                          : credsConfigured
                            ? (signedIn
                              ? 'Active — features that consume Google (currently Settings → Contacts > sync) will use this account.'
                              : 'Credentials saved. Sign in once below; other Google features (Contacts sync today, Gmail/Calendar/Drive later) will pick it up automatically.')
                            : 'Paste a Google OAuth client ID + secret to enable Google features. The credentials are yours; they stay on this machine.'}
                      </p>
                      {signedIn && accountEmail && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                          {accountEmail}
                        </div>
                      )}
                      {googleError && (
                        <p style={{ fontSize: 11, color: 'var(--color-error)', margin: '0 0 12px' }}>{googleError}</p>
                      )}

                      {!credsBundled && (
                      <button
                        type="button"
                        onClick={() => setGoogleHelpOpen((o) => !o)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--color-text-muted)',
                          cursor: 'pointer',
                          fontSize: 11,
                          letterSpacing: 0.6,
                          fontFamily: 'inherit',
                          marginBottom: 10,
                        }}
                      >
                        {googleHelpOpen ? '▾ HOW DO I GET THESE?' : '▸ HOW DO I GET THESE?'}
                      </button>
                      )}
                      {!credsBundled && googleHelpOpen && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            lineHeight: 1.7,
                            background: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-bg-secondary)',
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <p style={{ margin: '0 0 8px', color: 'var(--color-text-primary)' }}>
                            <strong>Why do I need to set this up myself?</strong>
                          </p>
                          <p style={{ margin: '0 0 8px' }}>
                            ProjectRose is open source — anyone can read its code. To talk to Google
                            services on your behalf, the app needs a pair of "keys" issued by Google.
                            Google requires the second key (the "client secret") to be kept private.
                            If we shipped it inside ProjectRose, anyone could pull it out of the public
                            code, which would let bad actors impersonate the app and likely get the
                            keys revoked — breaking the app for everyone.
                          </p>
                          <p style={{ margin: '0 0 12px' }}>
                            Until ProjectRose ships a hosted service that can hand out keys safely,
                            you'll need to make your own free pair in Google's developer console.
                            It's a one-time setup. Your keys stay on this computer and are only used
                            so ProjectRose can talk to your own Google account.
                          </p>
                          <p style={{ margin: '0 0 6px', color: 'var(--color-text-primary)' }}>
                            <strong>Steps:</strong>
                          </p>
                          <ol style={{ margin: '0 0 8px 20px', padding: 0 }}>
                            <li>Sign in to <span style={{ fontFamily: 'var(--font-mono)' }}>console.cloud.google.com</span> and create (or select) a project.</li>
                            <li>Enable the <em>People API</em> (Contacts sync needs it; enable Gmail/Calendar/Drive APIs later if you want those).</li>
                            <li>Open <em>APIs &amp; Services → OAuth consent screen</em>, choose "External", add yourself as a test user.</li>
                            <li>Open <em>APIs &amp; Services → Credentials</em>, click <em>Create Credentials → OAuth client ID</em>, pick <strong>Desktop app</strong>.</li>
                            <li>Copy the client ID and client secret it shows you, and paste them below.</li>
                          </ol>
                          <p style={{ margin: 0, fontStyle: 'italic' }}>
                            Your client secret is encrypted with your operating system's keychain and
                            never leaves this computer.
                          </p>
                        </div>
                      )}

                      {!credsBundled && (
                        <>
                          <FieldRow
                            label="OAUTH CLIENT ID"
                            hint="console.cloud.google.com/apis/credentials"
                          >
                            <KeyInput
                              value={googleClientIdDraft}
                              placeholder="xxx.apps.googleusercontent.com"
                              onChange={setGoogleClientIdDraft}
                              type="text"
                            />
                          </FieldRow>
                          <FieldRow label="OAUTH CLIENT SECRET" hint="stored in system keychain">
                            <KeyInput
                              value={googleClientSecretDraft}
                              placeholder="GOCSPX-..."
                              onChange={setGoogleClientSecretDraft}
                            />
                          </FieldRow>
                        </>
                      )}
                    </div>
                    <div className={styles.providerCardFooter} style={{ display: 'flex', gap: 8 }}>
                      {!credsBundled && (
                        <>
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            style={{ flex: 1 }}
                            onClick={googleClearCredentials}
                            disabled={(!credsConfigured && !signedIn) || googleBusy !== null}
                            title="Wipes the saved client ID, client secret, and refresh token."
                          >
                            CLEAR
                          </button>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            style={{ flex: 1 }}
                            onClick={googleSaveCredentials}
                            disabled={!draftReady || googleBusy !== null}
                          >
                            SAVE
                          </button>
                        </>
                      )}
                      {signedIn ? (
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          style={{ flex: 2 }}
                          onClick={googleSignOut}
                          disabled={googleBusy !== null}
                        >
                          {googleBusy ?? 'SIGN OUT'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          style={{ flex: 2 }}
                          onClick={googleSignIn}
                          disabled={!credsConfigured || googleBusy !== null}
                        >
                          {googleBusy ?? 'SIGN IN WITH GOOGLE'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          <div className={styles.sectionGap} />

          {(() => {
            const kind = 'search'
            const isExpanded = expandedProvider === kind
            const provider = searchStatus?.provider ?? null
            const keyStored = searchStatus?.keyStored ?? false
            const configured = provider !== null && keyStored
            const status: ProviderStatus = configured ? 'connected' : provider ? 'unverified' : 'missing'
            return (
              <div className={styles.providerCard}>
                <button
                  type="button"
                  onClick={() => setExpandedProvider(isExpanded ? null : kind)}
                  className={styles.providerCardHeader}
                  style={{
                    borderBottom: isExpanded ? '1px solid var(--color-bg-secondary)' : 'none',
                    background: isExpanded ? 'var(--color-bg-primary)' : 'transparent',
                  }}
                >
                  <div className={styles.providerCardHeaderInner}>
                    <div className={styles.providerGlyphBox}>
                      <span className={styles.providerSpecNum}>№S1</span>
                      <ProviderGlyph kind={kind} size={28} />
                    </div>
                    <div className={styles.providerNameBlock}>
                      <div className={styles.providerNameRow}>
                        <span className={styles.providerName}>Web Search</span>
                        <span className={styles.providerLatin}>Rosa quaerens</span>
                      </div>
                      <div className={styles.providerStatusRow}>
                        <StatusBadge state={status} />
                        <span className={styles.providerFieldInfo}>
                          {configured
                            ? `search_web via ${provider === 'brave' ? 'Brave Search' : provider === 'tavily' ? 'Tavily' : 'Browserbase'}`
                            : 'add an API key to enable the search_web tool'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={styles.providerCaret}
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▸
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className={`${styles.providerCardBody} ${styles.drawerIn}`}>
                    <div style={{ padding: '12px 16px 4px' }}>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
                        The agent&apos;s search_web tool calls this provider directly from your
                        machine — no ProjectRose account needed. Get a key at{' '}
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {searchProviderDraft === 'brave'
                            ? 'brave.com/search/api'
                            : searchProviderDraft === 'tavily'
                              ? 'tavily.com'
                              : 'browserbase.com'}
                        </span>
                        .
                      </p>
                      {searchError && (
                        <p style={{ fontSize: 11, color: 'var(--color-error)', margin: '0 0 12px' }}>{searchError}</p>
                      )}
                      <FieldRow label="PROVIDER" hint="determines which API the key belongs to">
                        <select
                          className={styles.hSelect}
                          value={searchProviderDraft}
                          onChange={(e) => setSearchProviderDraft(e.target.value as 'brave' | 'tavily' | 'browserbase')}
                        >
                          <option value="brave">Brave Search</option>
                          <option value="tavily">Tavily</option>
                          <option value="browserbase">Browserbase</option>
                        </select>
                      </FieldRow>
                      <FieldRow label="API KEY" hint="stored in system keychain">
                        <KeyInput
                          value={searchKeyDraft}
                          placeholder={
                            searchProviderDraft === 'brave' ? 'BSA…' : searchProviderDraft === 'tavily' ? 'tvly-…' : 'bb_…'
                          }
                          onChange={setSearchKeyDraft}
                        />
                      </FieldRow>
                    </div>
                    <div className={styles.providerCardFooter} style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        style={{ flex: 1 }}
                        onClick={searchClearCredentials}
                        disabled={(!provider && !keyStored) || searchBusy !== null}
                        title="Wipes the saved provider choice and API key."
                      >
                        CLEAR
                      </button>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        style={{ flex: 2 }}
                        onClick={searchSaveCredentials}
                        disabled={searchKeyDraft.trim().length === 0 || searchBusy !== null}
                      >
                        {searchBusy ?? 'SAVE'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

        </div>

        {/* ══ PLATE III · DOPPLER IMPORT ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="III"
            title="Doppler Import"
            sub="Pull API keys from a Doppler config into the providers and accounts above."
          />
          <div className={styles.sectionGap} />

          {(() => {
            const kind = 'doppler'
            const isExpanded = expandedProvider === kind
            const hasResults = dopplerApplied.length > 0
            const status: ProviderStatus = hasResults || dopplerAuthed ? 'connected' : 'missing'
            return (
              <div className={styles.providerCard}>
                <button
                  type="button"
                  onClick={() => setExpandedProvider(isExpanded ? null : kind)}
                  className={styles.providerCardHeader}
                  style={{
                    borderBottom: isExpanded ? '1px solid var(--color-bg-secondary)' : 'none',
                    background: isExpanded ? 'var(--color-bg-primary)' : 'transparent',
                  }}
                >
                  <div className={styles.providerCardHeaderInner}>
                    <div className={styles.providerGlyphBox}>
                      <span className={styles.providerSpecNum}>№D1</span>
                      <ProviderGlyph kind={kind} size={28} />
                    </div>
                    <div className={styles.providerNameBlock}>
                      <div className={styles.providerNameRow}>
                        <span className={styles.providerName}>Doppler Import</span>
                        <span className={styles.providerLatin}>Rosa importata</span>
                      </div>
                      <div className={styles.providerStatusRow}>
                        <StatusBadge state={status} />
                        <span className={styles.providerFieldInfo}>
                          {hasResults
                            ? `imported ${dopplerApplied.length} credential${dopplerApplied.length === 1 ? '' : 's'} this session`
                            : dopplerAuthed
                              ? 'signed in — pull API keys from a config'
                              : 'sign in or paste a token to pull API keys'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={styles.providerCaret}
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▸
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className={`${styles.providerCardBody} ${styles.drawerIn}`}>
                    <div style={{ padding: '12px 16px 4px' }}>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
                        Fetch a Doppler config and import any recognized API keys into the
                        providers above. Sign in keeps an encrypted Doppler token in your system
                        keychain; a pasted token is used for the import only and never saved.
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 14px' }}>
                        <thead>
                          <tr>
                            <th style={dopplerTh}>DOPPLER SECRET</th>
                            <th style={dopplerTh}>IMPORTS TO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {DOPPLER_KEY_ROWS.map((row) => (
                            <tr key={row.secret}>
                              <td style={{ ...dopplerTd, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-primary)' }}>
                                {row.secret}
                              </td>
                              <td style={{ ...dopplerTd, color: 'var(--color-text-muted)' }}>{row.importsTo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {dopplerError && (
                        <p style={{ fontSize: 11, color: 'var(--color-error)', margin: '0 0 12px' }}>{dopplerError}</p>
                      )}
                      {dopplerApplied.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-saved)', lineHeight: 1.7, margin: '0 0 12px' }}>
                          {dopplerApplied.map((d) => <div key={d}>✓ {d}</div>)}
                        </div>
                      )}
                      {dopplerAuthed ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
                            <span style={{ fontSize: 12, color: 'var(--color-saved)' }}>● Signed in to Doppler</span>
                            <button
                              type="button"
                              onClick={dopplerLogout}
                              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 11, letterSpacing: 0.6, fontFamily: 'inherit', textDecoration: 'underline' }}
                            >
                              SIGN OUT
                            </button>
                          </div>
                          <FieldRow label="PROJECT" hint="Doppler project to pull from">
                            <select
                              className={styles.hSelect}
                              value={dopplerProject}
                              onChange={(e) => setDopplerProject(e.target.value)}
                            >
                              {!dopplerProject && <option value="" disabled>Select a project</option>}
                              {dopplerProjects.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </FieldRow>
                          <FieldRow label="CONFIG" hint="environment config within the project">
                            <select
                              className={styles.hSelect}
                              value={dopplerConfig}
                              onChange={(e) => setDopplerConfig(e.target.value)}
                              disabled={!dopplerProject}
                            >
                              {!dopplerConfig && <option value="" disabled>Select a config</option>}
                              {dopplerConfigs.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </FieldRow>
                        </>
                      ) : dopplerAuthMode === 'pending' ? (
                        <div style={{ margin: '0 0 12px' }}>
                          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                            Browser opened — enter the code below in the Doppler dashboard to authorize.
                            {dopplerPendingAuth?.url && (
                              <>
                                {' '}
                                <button
                                  type="button"
                                  onClick={() => navigator.clipboard.writeText(dopplerPendingAuth.url).catch(() => {})}
                                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11, fontFamily: 'inherit' }}
                                >
                                  COPY LINK
                                </button>
                              </>
                            )}
                          </p>
                          {dopplerPendingAuth?.userCode && (
                            <p style={{ fontSize: 12, margin: '0 0 8px', color: 'var(--color-text-primary)' }}>
                              Auth code:{' '}
                              <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(dopplerPendingAuth.userCode).catch(() => {})}
                                title="Click to copy"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: '0.1em', color: 'var(--color-accent)', textDecoration: 'underline' }}
                              >
                                {dopplerPendingAuth.userCode}
                              </button>
                            </p>
                          )}
                          <button type="button" className={styles.ghostBtn} onClick={dopplerCancelLogin}>
                            CANCEL SIGN-IN
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            style={{ width: '100%', marginBottom: 12 }}
                            onClick={dopplerLogin}
                          >
                            SIGN IN WITH DOPPLER
                          </button>
                          <p style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: 0.6, margin: '0 0 10px', textAlign: 'center' }}>
                            — OR PASTE A TOKEN —
                          </p>
                          <FieldRow label="DOPPLER TOKEN" hint="service token (dp.st.…) or personal token">
                            <KeyInput value={dopplerToken} placeholder="dp.st.…" onChange={setDopplerToken} />
                          </FieldRow>
                          <FieldRow label="PROJECT" hint="only needed for personal tokens">
                            <KeyInput value={dopplerProject} placeholder="project (optional)" onChange={setDopplerProject} type="text" />
                          </FieldRow>
                          <FieldRow label="CONFIG" hint="only needed for personal tokens">
                            <KeyInput value={dopplerConfig} placeholder="config (optional)" onChange={setDopplerConfig} type="text" />
                          </FieldRow>
                        </>
                      )}
                      {dopplerFound && (
                        <div style={{ margin: '12px 0 4px' }}>
                          {dopplerFound.candidates.length === 0 ? (
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                              No recognizable API keys among {dopplerFound.totalSecrets} secret{dopplerFound.totalSecrets === 1 ? '' : 's'} in this config.
                            </p>
                          ) : (
                            <>
                              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 8px', letterSpacing: 0.6 }}>
                                FOUND {dopplerFound.candidates.length} OF {dopplerFound.totalSecrets} SECRETS USABLE — SELECT WHAT TO IMPORT
                              </p>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...dopplerTh, width: 28 }} aria-label="Import" />
                                    <th style={dopplerTh}>DESTINATION</th>
                                    <th style={dopplerTh}>DOPPLER SECRET</th>
                                    <th style={dopplerTh}>VALUE</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dopplerFound.candidates.map((c) => (
                                    <tr
                                      key={c.target}
                                      onClick={() => dopplerToggle(c.target)}
                                      style={{ cursor: 'pointer', background: dopplerSelected.has(c.target) ? 'var(--color-bg-primary)' : 'transparent' }}
                                    >
                                      <td style={{ ...dopplerTd, textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={dopplerSelected.has(c.target)}
                                          onChange={() => dopplerToggle(c.target)}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </td>
                                      <td style={{ ...dopplerTd, color: 'var(--color-text-primary)' }}>{c.label}</td>
                                      <td style={{ ...dopplerTd, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                        {c.secretName}
                                      </td>
                                      <td style={{ ...dopplerTd, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                        {c.maskedValue}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles.providerCardFooter} style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        style={{ flex: 1 }}
                        onClick={dopplerFetch}
                        disabled={!dopplerCanFetch || dopplerBusy !== null}
                      >
                        {dopplerBusy === 'fetch' ? 'FETCHING…' : dopplerFound ? '↻ RE-FETCH' : 'FETCH SECRETS'}
                      </button>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        style={{ flex: 2 }}
                        onClick={dopplerImport}
                        disabled={!dopplerFound || dopplerSelected.size === 0 || dopplerBusy !== null}
                      >
                        {dopplerBusy === 'apply'
                          ? 'IMPORTING…'
                          : `IMPORT${dopplerSelected.size > 0 ? ` ${dopplerSelected.size} SELECTED` : ''}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Colophon */}
        <div className={styles.colophon}>
          <span>COLOPHON · settings persist on change · keys held in system keychain</span>
          <span className={styles.colophonAccent}>Rosa configurata</span>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Render: Tools (PLATE I)
  // ─────────────────────────────────────────────────────────

  function renderTools(): JSX.Element {
    return (
      <>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.pageHeaderMeta}>PROJECTROSE · SETTINGS · TOOLS</div>
            <div className={styles.pageTitle}>
              <span className={styles.pageTitleAccent}>Tools</span>
              {' · '}
              <span className={styles.pageTitleSub}>core, project & extension</span>
            </div>
          </div>
          <div className={styles.pageHeaderRight}>
            <div>PLATE · I</div>
            <div className={styles.colophonAccent}>Rosa configurata</div>
          </div>
        </div>
        <hr className={styles.pageHeaderDivider} />

        {/* ══ PLATE I · TOOLS ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="I"
            title="Tools"
            sub="What the agent is allowed to do."
          />
          <div className={styles.sectionGapSm} />

          <div className={styles.panelBlock}>
            <div className={styles.panelHeader}>
              <span>TOOLS · CORE</span>
              <span className={styles.panelHeaderCount}>
                {availableTools.filter((t) => t.type === 'core' && !disabledTools.includes(t.name)).length}
                /
                {availableTools.filter((t) => t.type === 'core').length} enabled
              </span>
            </div>
            {availableTools.filter((t) => t.type === 'core').map((tool) => {
              const enabled = !disabledTools.includes(tool.name)
              return (
                <HSettingRow key={tool.name} label={tool.displayName} desc={tool.description}>
                  <HToggle on={enabled} onChange={() => toggleTool(tool.name)} />
                </HSettingRow>
              )
            })}
            {availableTools.filter((t) => t.type === 'core').length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No core tools loaded.
              </div>
            )}
          </div>

          {/* Extension tools (below the grid, kept accessible) */}
          {availableTools.filter((t) => t.type === 'extension').length > 0 && (
            <div style={{ marginTop: 18 }}>
              {Object.entries(
                availableTools
                  .filter((t) => t.type === 'extension')
                  .reduce<Record<string, ToolMeta[]>>((acc, t) => {
                    const key = t.extensionName ?? t.extensionId ?? 'Extension'
                    ;(acc[key] ??= []).push(t)
                    return acc
                  }, {})
              ).map(([groupName, groupTools]) => (
                <div key={groupName} className={styles.panelBlock} style={{ marginBottom: 12 }}>
                  <div className={styles.panelHeader}>{groupName.toUpperCase()}</div>
                  {groupTools.map((tool) => {
                    const enabled = !disabledTools.includes(tool.name)
                    return (
                      <HSettingRow key={tool.name} label={tool.displayName} desc={tool.description}>
                        <HToggle on={enabled} onChange={() => toggleTool(tool.name)} />
                      </HSettingRow>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colophon */}
        <div className={styles.colophon}>
          <span>COLOPHON · settings persist on change · keys held in system keychain</span>
          <span className={styles.colophonAccent}>Rosa configurata</span>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Render: Skills (PLATE I)
  // ─────────────────────────────────────────────────────────

  function renderSkills(): JSX.Element {
    return (
      <>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.pageHeaderMeta}>PROJECTROSE · SETTINGS · SKILLS</div>
            <div className={styles.pageTitle}>
              <span className={styles.pageTitleAccent}>Skills</span>
              {' · '}
              <span className={styles.pageTitleSub}>system-prompt grafts</span>
            </div>
          </div>
          <div className={styles.pageHeaderRight}>
            <div>PLATE · I</div>
            <div className={styles.colophonAccent}>Rosa configurata</div>
          </div>
        </div>
        <hr className={styles.pageHeaderDivider} />

        {/* ══ PLATE I · SKILLS ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="I"
            title="Skills"
            sub="Markdown files injected into the system prompt when the agent loads them."
          />
          <div className={styles.sectionGapSm} />

          <div className={styles.panelBlock}>
            <div className={styles.panelHeader}>
              <span>SKILLS · PROJECT</span>
              <span className={styles.panelHeaderCount}>{skills.length} available</span>
            </div>
            {skills.length === 0 && (
              <div style={{ padding: '14px 18px', fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No skills yet. Add a .md file to get started.
              </div>
            )}
            {skills.map((skill) => (
              <div key={skill.name} className={styles.skillRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.skillName}>{skill.name}</div>
                  {skill.description && (
                    <div className={styles.skillDesc}>{skill.description}</div>
                  )}
                </div>
                <button className={styles.skillRemoveBtn} onClick={() => deleteSkill(skill.name)} title="Remove skill">
                  ×
                </button>
              </div>
            ))}
            <button className={styles.addModelRow} onClick={uploadSkill}>
              + ADD SKILL
            </button>
          </div>
        </div>

        {/* Colophon */}
        <div className={styles.colophon}>
          <span>COLOPHON · settings persist on change · keys held in system keychain</span>
          <span className={styles.colophonAccent}>Rosa configurata</span>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Render: Extensions
  // ─────────────────────────────────────────────────────────

  function renderExtensions(): JSX.Element {
    return <ExtensionsTab />
  }

  // ─────────────────────────────────────────────────────────
  // Page router
  // ─────────────────────────────────────────────────────────

  function renderPage(): JSX.Element {
    switch (activePage) {
      case 'general':    return renderGeneral()
      case 'providers':  return renderProviders()
      case 'tools':      return renderTools()
      case 'skills':     return renderSkills()
      case 'prompts':    return <PromptsTab />
      case 'updates':    return <UpdatesTab />
      case 'extensions': return renderExtensions()
      default: {
        const label = topLevelItems.find((i) => i.id === activePage)?.label ?? activePage
        return (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{label}</div>
            <div className={styles.emptyState}>No settings available for this section yet.</div>
          </section>
        )
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Root render
  // ─────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      <div className={styles.body}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLabel}>Settings · Drawer</div>
          {topLevelItems.map((item) => {
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                onClick={() => setActivePage(item.id)}
              >
                <span className={`${styles.sidebarItemNum} ${isActive ? styles.sidebarItemActiveNum : ''}`}>
                  №{item.n}
                </span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </aside>

        {/* Main content */}
        <div className={styles.content}>
          <div className={styles.page}>
            {renderPage()}
          </div>
        </div>
      </div>

      <WhisperModelInstallModal
        open={installModalOpen}
        targetModel={pendingWhisperModel}
        onConfirm={handleWhisperInstallConfirm}
        onCancel={handleWhisperInstallCancel}
        onHide={handleWhisperInstallHide}
        onComplete={handleWhisperInstallComplete}
      />
    </div>
  )
}
