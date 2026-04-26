import { useEffect, useState, useCallback, useRef } from 'react'
import { ExtensionsTab } from './ExtensionsTab'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { getAllExtensions, getExtensionByViewId, subscribeToExtensionsChange } from '../../extensions/registry'
import { NavItem } from '../../../../shared/types'
import type { ModelConfig, ToolMeta } from '../../types/electron'
import styles from './SettingsView.module.css'

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
  anthropic: [
    { key: 'apiKey', label: 'API KEY', placeholder: 'sk-ant-...', secret: true, hint: 'console.anthropic.com' },
  ],
  openai: [
    { key: 'apiKey', label: 'API KEY', placeholder: 'sk-...', secret: true, hint: 'platform.openai.com' },
  ],
  bedrock: [
    { key: 'region', label: 'AWS REGION', placeholder: 'us-east-1', secret: false },
    { key: 'accessKeyId', label: 'ACCESS KEY ID', placeholder: 'AKIA...', secret: true },
    { key: 'secretAccessKey', label: 'SECRET ACCESS KEY', placeholder: 'wJalrXUtn...', secret: true },
  ],
  ollama: [
    { key: 'baseUrl', label: 'BASE URL', placeholder: 'http://localhost:11434', secret: false, hint: 'no key required · local' },
  ],
  compat: [
    { key: 'baseUrl', label: 'BASE URL', placeholder: 'https://api.example.com/v1', secret: false },
    { key: 'apiKey', label: 'API KEY (optional)', placeholder: 'leave blank if none', secret: true },
  ],
}

interface ProviderMeta {
  kind: string
  spec: string
  name: string
  latin: string
}

const PROVIDERS: ProviderMeta[] = [
  { kind: 'anthropic', spec: '01', name: 'Anthropic',         latin: 'Rosa claudia'    },
  { kind: 'openai',    spec: '02', name: 'OpenAI',            latin: 'Rosa generativa' },
  { kind: 'bedrock',   spec: '03', name: 'Amazon Bedrock',    latin: 'Rosa nubila'     },
  { kind: 'ollama',    spec: '04', name: 'Ollama',            latin: 'Rosa localis'    },
  { kind: 'compat',    spec: '05', name: 'OpenAI-compatible', latin: 'Rosa heterodoxa' },
]

// ─────────────────────────────────────────────────────────────
// Model fallbacks
// ─────────────────────────────────────────────────────────────

const ANTHROPIC_FALLBACK = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
const OPENAI_FALLBACK = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini']
const BEDROCK_FALLBACK = [
  'anthropic.claude-opus-4-20250514-v1:0',
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'anthropic.claude-3-5-haiku-20241022-v1:0',
  'meta.llama3-70b-instruct-v1:0',
  'meta.llama3-8b-instruct-v1:0',
  'amazon.titan-text-express-v1',
]

// ─────────────────────────────────────────────────────────────
// Pure components
// ─────────────────────────────────────────────────────────────

function ProviderGlyph({ kind, size = 28 }: { kind: string; size?: number }): JSX.Element | null {
  const c = 'var(--color-accent)'
  switch (kind) {
    case 'anthropic':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size}>
          <path d="M16 4 L26 26 L21 26 L19 21 L13 21 L11 26 L6 26 Z M14.5 17 L17.5 17 L16 13 Z" fill={c}/>
        </svg>
      )
    case 'openai':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <circle cx="16" cy="16" r="11"/>
          <path d="M9 12 L23 12 M9 16 L23 16 M9 20 L23 20" opacity="0.5"/>
          <circle cx="16" cy="16" r="3" fill={c} stroke="none"/>
        </svg>
      )
    case 'bedrock':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <path d="M4 22 L16 8 L28 22 Z"/>
          <path d="M9 22 L16 14 L23 22" opacity="0.5"/>
          <circle cx="16" cy="22" r="1.5" fill={c} stroke="none"/>
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
    case 'compat':
      return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={c} strokeWidth="1.6">
          <rect x="6" y="10" width="20" height="12" rx="1"/>
          <path d="M10 14 L14 18 L10 22 M16 22 L22 22" opacity="0.7"/>
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

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function SettingsView(): JSX.Element {
  const {
    micDeviceId, userName, agentName,
    navItems, models, defaultModelId, providerKeys, router,
    includeThinkingInContext,
    ollamaBaseUrl, openaiCompatBaseUrl, openaiCompatApiKey,
    update,
  } = useSettingsStore()

  const rootPath = useProjectStore((s) => s.rootPath)

  // ── tool state ──
  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([])
  const [disabledTools, setDisabledTools] = useState<string[]>([])

  // ── nav ──
  const [activePage, setActivePage] = useState('dashboard')
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // ── audio ──
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])

  // ── model fetch state ──
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [ollamaModels, setOllamaModels] = useState<Record<string, string[]>>({})
  const [ollamaFetching, setOllamaFetching] = useState<Record<string, boolean>>({})
  const [anthropicModels, setAnthropicModels] = useState<string[]>([])
  const [openaiModels, setOpenaiModels] = useState<string[]>([])
  const [anthropicFetching, setAnthropicFetching] = useState(false)
  const [openaiFetching, setOpenaiFetching] = useState(false)

  // ── provider card state ──
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [testedProviders, setTestedProviders] = useState<Record<string, 'connected' | 'error'>>({})
  const [providerTesting, setProviderTesting] = useState<Record<string, boolean>>({})

  // ── behavior (local — store additions possible later) ──
  const [autoSummarize, setAutoSummarize] = useState(true)
  const [streamToolResults, setStreamToolResults] = useState(false)

  // ── extensions ──
  const [, setExtVersion] = useState(0)
  useEffect(() => subscribeToExtensionsChange(() => setExtVersion((v) => v + 1)), [])

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

  // ── nav drag ──
  const handleNavDragStart = useCallback((index: number) => { dragIndexRef.current = index }, [])
  const handleNavDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault(); setDragOverIndex(index)
  }, [])
  const handleNavDrop = useCallback((dropIndex: number) => {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null; setDragOverIndex(null); return
    }
    const reordered = [...navItems]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    dragIndexRef.current = null; setDragOverIndex(null)
    update({ navItems: reordered })
  }, [navItems, update])
  const handleNavDragEnd = useCallback(() => {
    dragIndexRef.current = null; setDragOverIndex(null)
  }, [])
  const toggleNavItemVisible = useCallback((index: number) => {
    const updated: NavItem[] = navItems.map((item, i) =>
      i === index ? { ...item, visible: !item.visible } : item
    )
    update({ navItems: updated })
  }, [navItems, update])

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

  const fetchAnthropicModels = useCallback(async (apiKey: string) => {
    if (!apiKey) return
    setAnthropicFetching(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { data: { id: string }[] }
      setAnthropicModels(data.data.map((m) => m.id))
    } catch {
      setAnthropicModels([])
    } finally {
      setAnthropicFetching(false)
    }
  }, [])

  const fetchOpenAIModels = useCallback(async (apiKey: string) => {
    if (!apiKey) return
    setOpenaiFetching(true)
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { data: { id: string }[] }
      setOpenaiModels(data.data.map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/i.test(id)).sort())
    } catch {
      setOpenaiModels([])
    } finally {
      setOpenaiFetching(false)
    }
  }, [])

  useEffect(() => {
    if (activePage !== 'chat') return
    for (const m of models) {
      if (m.provider === 'ollama' && m.baseUrl && !(m.id in ollamaModels)) {
        fetchOllamaModels(m.id, m.baseUrl)
      }
    }
    if (router.enabled && router.modelName && !('__router__' in ollamaModels)) {
      fetchOllamaModels('__router__', router.baseUrl)
    }
    if (providerKeys.anthropic && anthropicModels.length === 0) fetchAnthropicModels(providerKeys.anthropic)
    if (providerKeys.openai && openaiModels.length === 0) fetchOpenAIModels(providerKeys.openai)
  }, [activePage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────
  // Provider helpers
  // ─────────────────────────────────────────────────────────

  function getProviderFields(kind: string): Record<string, string> {
    switch (kind) {
      case 'anthropic': return { apiKey: providerKeys.anthropic }
      case 'openai':    return { apiKey: providerKeys.openai }
      case 'bedrock':   return {
        region: providerKeys.bedrock?.region ?? 'us-east-1',
        accessKeyId: providerKeys.bedrock?.accessKeyId ?? '',
        secretAccessKey: providerKeys.bedrock?.secretAccessKey ?? '',
      }
      case 'ollama':  return { baseUrl: ollamaBaseUrl }
      case 'compat':  return { baseUrl: openaiCompatBaseUrl, apiKey: openaiCompatApiKey }
      default: return {}
    }
  }

  function getProviderStatus(kind: string): ProviderStatus {
    if (testedProviders[kind] === 'connected') return 'connected'
    if (testedProviders[kind] === 'error') return 'error'
    const fields = getProviderFields(kind)
    const hasContent = Object.values(fields).some((v) => v && v !== '')
    if (kind === 'bedrock') {
      return fields.accessKeyId ? 'unverified' : 'missing'
    }
    return hasContent ? 'unverified' : 'missing'
  }

  function handleProviderFieldChange(kind: string, key: string, value: string): void {
    setTestedProviders((prev) => { const n = { ...prev }; delete n[kind]; return n })
    switch (kind) {
      case 'anthropic':
        update({ providerKeys: { ...providerKeys, anthropic: value } }); break
      case 'openai':
        update({ providerKeys: { ...providerKeys, openai: value } }); break
      case 'bedrock':
        update({ providerKeys: { ...providerKeys, bedrock: { ...providerKeys.bedrock, [key]: value } } }); break
      case 'ollama':
        update({ ollamaBaseUrl: value }); break
      case 'compat':
        if (key === 'baseUrl') update({ openaiCompatBaseUrl: value })
        else update({ openaiCompatApiKey: value })
        break
    }
  }

  function clearProvider(kind: string): void {
    setTestedProviders((prev) => { const n = { ...prev }; delete n[kind]; return n })
    switch (kind) {
      case 'anthropic':
        update({ providerKeys: { ...providerKeys, anthropic: '' } }); break
      case 'openai':
        update({ providerKeys: { ...providerKeys, openai: '' } }); break
      case 'bedrock':
        update({ providerKeys: { ...providerKeys, bedrock: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' } } }); break
      case 'ollama':
        update({ ollamaBaseUrl: '' }); break
      case 'compat':
        update({ openaiCompatBaseUrl: '', openaiCompatApiKey: '' }); break
    }
  }

  async function verifyProvider(kind: string): Promise<void> {
    setProviderTesting((prev) => ({ ...prev, [kind]: true }))
    try {
      let ok = false
      if (kind === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
          headers: { 'x-api-key': providerKeys.anthropic, 'anthropic-version': '2023-06-01' },
        })
        ok = res.ok
        if (ok) {
          const data = await res.json() as { data: { id: string }[] }
          setAnthropicModels(data.data.map((m) => m.id))
        }
      } else if (kind === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${providerKeys.openai}` },
        })
        ok = res.ok
      } else if (kind === 'bedrock') {
        ok = !!(providerKeys.bedrock?.accessKeyId && providerKeys.bedrock?.secretAccessKey)
      } else if (kind === 'ollama') {
        const url = (ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')
        const res = await fetch(`${url}/api/tags`)
        ok = res.ok
        if (ok) fetchOllamaModels('__ollama_provider__', ollamaBaseUrl)
      } else if (kind === 'compat') {
        const url = openaiCompatBaseUrl.replace(/\/$/, '')
        const headers: Record<string, string> = {}
        if (openaiCompatApiKey) headers.Authorization = `Bearer ${openaiCompatApiKey}`
        const res = await fetch(`${url}/models`, { headers })
        ok = res.ok
      }
      setTestedProviders((prev) => ({ ...prev, [kind]: ok ? 'connected' : 'error' }))
      if (ok) setTimeout(() => setExpandedProvider(null), 350)
    } catch {
      setTestedProviders((prev) => ({ ...prev, [kind]: 'error' }))
    } finally {
      setProviderTesting((prev) => { const n = { ...prev }; delete n[kind]; return n })
    }
  }

  // ─────────────────────────────────────────────────────────
  // Model helpers
  // ─────────────────────────────────────────────────────────

  function addModel(): void {
    const newModel: ModelConfig = {
      id: crypto.randomUUID(), displayName: '', provider: 'anthropic', modelName: '', baseUrl: '', tags: [],
    }
    const updated = [...models, newModel]
    update({ models: updated, defaultModelId: updated.length === 1 ? newModel.id : defaultModelId })
  }

  function removeModel(id: string): void {
    const updated = models.filter((m) => m.id !== id)
    update({ models: updated, defaultModelId: defaultModelId === id ? (updated[0]?.id ?? '') : defaultModelId })
  }

  function patchModel(id: string, patch: Partial<ModelConfig>): void {
    update({ models: models.map((m) => m.id === id ? { ...m, ...patch } : m) })
  }

  function renderModelSelectForRow(
    key: string,
    provider: ModelConfig['provider'],
    value: string,
    onChange: (v: string) => void
  ): JSX.Element {
    if (provider === 'openai-compatible') {
      return (
        <input
          className={styles.modelTechInput}
          type="text"
          placeholder="model name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    let options: string[]
    if (provider === 'anthropic') options = anthropicModels.length > 0 ? anthropicModels : ANTHROPIC_FALLBACK
    else if (provider === 'openai') options = openaiModels.length > 0 ? openaiModels : OPENAI_FALLBACK
    else if (provider === 'bedrock') options = BEDROCK_FALLBACK
    else options = ollamaModels[key] ?? []

    return (
      <select
        className={styles.modelTechInput}
        style={{ appearance: 'none', cursor: 'pointer' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!value && <option value="" disabled>select model</option>}
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Sidebar items
  // ─────────────────────────────────────────────────────────

  const extensionSettingsItems = getAllExtensions()
    .filter((e) => e.SettingsView != null)
    .map((e) => ({ id: e.manifest.id, label: e.manifest.name }))

  const sidebarItems = [
    { id: 'dashboard',  label: 'Dashboard',  n: '01' },
    { id: 'chat',       label: 'Agent',       n: '02' },
    ...extensionSettingsItems.map((e, i) => ({ ...e, n: String(i + 3).padStart(2, '0') })),
    { id: 'extensions', label: 'Extensions', n: String(extensionSettingsItems.length + 3).padStart(2, '0') },
  ]

  useEffect(() => {
    if (activePage !== 'dashboard' && !sidebarItems.some((i) => i.id === activePage)) {
      setActivePage('dashboard')
    }
  }, [sidebarItems.map((i) => i.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────
  // Status bar data
  // ─────────────────────────────────────────────────────────

  const connectedCount = PROVIDERS.filter((p) => getProviderStatus(p.kind) === 'connected').length
  const activeProviderName =
    PROVIDERS.find((p) => getProviderStatus(p.kind) === 'connected')?.name ?? '—'

  // ─────────────────────────────────────────────────────────
  // Render: Dashboard
  // ─────────────────────────────────────────────────────────

  function renderDashboard(): JSX.Element {
    return (
      <>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Navigation Bar</div>
          <div className={styles.navList}>
            {navItems
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => item.viewId !== 'settings')
              .map(({ item, index }) => (
                <div
                  key={item.viewId}
                  className={`${styles.navItem} ${dragOverIndex === index ? styles.navItemDragOver : ''}`}
                  draggable
                  onDragStart={() => handleNavDragStart(index)}
                  onDragOver={(e) => handleNavDragOver(e, index)}
                  onDrop={() => handleNavDrop(index)}
                  onDragEnd={handleNavDragEnd}
                >
                  <span className={styles.navDragHandle}>⠿</span>
                  <span className={styles.navItemLabel}>{item.label}</span>
                  <button
                    type="button"
                    className={`${styles.toggle} ${item.visible ? styles.toggleOn : styles.toggleOff}`}
                    onClick={() => toggleNavItemVisible(index)}
                    role="switch"
                    aria-checked={item.visible}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </div>
              ))}
            {navItems.find((item) => item.viewId === 'settings') && (
              <div className={styles.navItem}>
                <span className={styles.navDragHandle} style={{ opacity: 0.2, cursor: 'default' }}>⠿</span>
                <span className={styles.navItemLabel}>Settings</span>
                <span className={styles.navItemLocked}>always visible</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Voice Input</div>
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
      </>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Render: Agent (PLATES I – IV)
  // ─────────────────────────────────────────────────────────

  function renderAgent(): JSX.Element {
    return (
      <>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.pageHeaderMeta}>PROJECTROSE · SETTINGS · AGENT</div>
            <div className={styles.pageTitle}>
              <span className={styles.pageTitleAccent}>Agent</span>
              {' · '}
              <span className={styles.pageTitleSub}>specimen drawer</span>
            </div>
          </div>
          <div className={styles.pageHeaderRight}>
            <div>PLATES · I — IV</div>
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
            right={
              <div className={styles.sectionMeta}>
                <span className={styles.sectionMetaCount}>
                  {connectedCount} of {PROVIDERS.length} connected
                </span>
              </div>
            }
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
                          {status === 'connected' || status === 'unverified'
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
                    <div className={styles.providerCardFooter}>
                      <span className={styles.providerStorageHint}>
                        stored in {p.kind === 'ollama' ? 'config file' : 'system keychain'}
                      </span>
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
                  </div>
                )}
              </div>
            )
          })}

          <div className={styles.addProviderHint}>
            <span>+ ADD CUSTOM PROVIDER · OpenAI-compatible endpoint, MCP, etc.</span>
            <span style={{ opacity: 0.5, fontSize: 9 }}>use the compat card above</span>
          </div>
        </div>

        {/* ══ PLATE II · ROUTER ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="II"
            title="Router"
            sub="A small local model that picks which model to use per request — tagged by use-case."
          />
          <div className={styles.sectionGapSm} />

          <div className={styles.settingsBlock}>
            <HSettingRow
              label="Enable Router"
              desc="Every prompt is first sent to a small local Ollama model that decides which cataloged model to dispatch to."
            >
              <HToggle
                on={router.enabled}
                onChange={(v) => update({ router: { ...router, enabled: v } })}
              />
            </HSettingRow>
            {router.enabled && (
              <div className={`${styles.drawerBody} ${styles.drawerIn}`}>
                <FieldRow label="OLLAMA BASE URL" hint="local · no key">
                  <KeyInput
                    value={router.baseUrl}
                    placeholder="http://localhost:11434"
                    type="text"
                    onChange={(v) => update({ router: { ...router, baseUrl: v } })}
                  />
                </FieldRow>
                <FieldRow label="ROUTER MODEL" hint="lightweight · fast">
                  <select
                    className={styles.hSelect}
                    value={router.modelName}
                    onChange={(e) => update({ router: { ...router, modelName: e.target.value } })}
                    onFocus={() => fetchOllamaModels('__router__', router.baseUrl)}
                  >
                    <option value="" disabled>Select a router model</option>
                    {(ollamaModels['__router__'] ?? []).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {router.modelName && !(ollamaModels['__router__'] ?? []).includes(router.modelName) && (
                      <option value={router.modelName}>{router.modelName}</option>
                    )}
                  </select>
                </FieldRow>
              </div>
            )}
          </div>
        </div>

        {/* ══ PLATE III · MODELS ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="III"
            title="Models"
            sub="Cataloged endpoints — the default is used when no use-case tag matches."
          />
          <div className={styles.sectionGapSm} />

          <div className={styles.modelsTable}>
            <div className={styles.modelsTableHeader}>
              <span />
              <span>DISPLAY NAME / MODEL</span>
              <span>PROVIDER</span>
              <span>USE-CASE TAGS</span>
              <span />
            </div>

            {models.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No models cataloged. Add one below.
              </div>
            )}

            {models.map((m) => (
              <div key={m.id} className={styles.modelRow}>
                {/* default radio */}
                <input
                  type="radio"
                  name="defaultModel"
                  checked={defaultModelId === m.id}
                  onChange={() => update({ defaultModelId: m.id })}
                  style={{ accentColor: 'var(--color-accent)', cursor: 'pointer', marginTop: 6 }}
                />

                {/* display name + model name */}
                <div className={styles.modelNameCell}>
                  <input
                    className={styles.modelDisplayInput}
                    type="text"
                    placeholder="Display name"
                    value={m.displayName}
                    onChange={(e) => patchModel(m.id, { displayName: e.target.value })}
                  />
                  {renderModelSelectForRow(m.id, m.provider, m.modelName, (v) => patchModel(m.id, { modelName: v }))}
                  {(m.provider === 'ollama' || m.provider === 'openai-compatible') && (
                    <input
                      className={styles.modelBaseUrlInput}
                      type="text"
                      placeholder={m.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                      value={m.baseUrl}
                      onChange={(e) => patchModel(m.id, { baseUrl: e.target.value })}
                      onBlur={(e) => m.provider === 'ollama' && fetchOllamaModels(m.id, e.target.value)}
                    />
                  )}
                </div>

                {/* provider */}
                <div className={styles.modelProviderCell}>
                  <ProviderGlyph kind={m.provider === 'openai-compatible' ? 'compat' : m.provider} size={16} />
                  <select
                    className={styles.modelProviderSelect}
                    value={m.provider}
                    onChange={(e) => patchModel(m.id, { provider: e.target.value as ModelConfig['provider'], modelName: '' })}
                  >
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama</option>
                    <option value="openai-compatible">Compatible</option>
                    <option value="bedrock">Bedrock</option>
                  </select>
                </div>

                {/* tags */}
                <div className={styles.modelTagsCell}>
                  {m.tags.map((t) => (
                    <span key={t} className={styles.tagChip}>
                      {t}
                      <button
                        type="button"
                        className={styles.tagRemoveBtn}
                        onClick={() => patchModel(m.id, { tags: m.tags.filter((x) => x !== t) })}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className={styles.tagAddInput}
                    type="text"
                    placeholder="+ tag"
                    value={m.id in tagInputs ? tagInputs[m.id] : ''}
                    onChange={(e) => setTagInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        const val = (tagInputs[m.id] ?? '').trim()
                        if (val) patchModel(m.id, { tags: [...m.tags, val] })
                        setTagInputs((prev) => { const n = { ...prev }; delete n[m.id]; return n })
                      }
                    }}
                    onBlur={() => {
                      const val = (tagInputs[m.id] ?? '').trim()
                      if (val) patchModel(m.id, { tags: [...m.tags, val] })
                      setTagInputs((prev) => { const n = { ...prev }; delete n[m.id]; return n })
                    }}
                  />
                </div>

                {/* remove */}
                <button
                  type="button"
                  className={styles.modelRemoveBtn}
                  onClick={() => removeModel(m.id)}
                >
                  REMOVE
                </button>
              </div>
            ))}

            <button type="button" className={styles.addModelRow} onClick={addModel}>
              + ADD MODEL TO CATALOG
            </button>
          </div>
        </div>

        {/* ══ PLATE IV · BEHAVIOR & TOOLS ══ */}
        <div className={styles.plateSection}>
          <SectionHeader
            n="IV"
            title="Behavior & Tools"
            sub="What the agent remembers and what it's allowed to do."
          />
          <div className={styles.sectionGapSm} />

          <div className={styles.behaviorToolsGrid}>
            {/* Behavior column */}
            <div className={styles.panelBlock}>
              <div className={styles.panelHeader}>BEHAVIOR · CONTEXT</div>
              <HSettingRow
                label="Include thinking in context"
                desc="Injects the model's reasoning into the conversation history so it remembers its own thinking across messages."
              >
                <HToggle
                  on={includeThinkingInContext}
                  onChange={(v) => update({ includeThinkingInContext: v })}
                />
              </HSettingRow>
              <HSettingRow
                label="Auto-summarize at 80% context"
                desc="Compress earlier messages once the context window fills, so long sessions don't drop the thread."
              >
                <HToggle on={autoSummarize} onChange={setAutoSummarize} />
              </HSettingRow>
              <HSettingRow
                label="Stream tool results inline"
                desc="Show tool output as it arrives instead of waiting for the full call to finish."
              >
                <HToggle on={streamToolResults} onChange={setStreamToolResults} />
              </HSettingRow>
            </div>

            {/* Tools column */}
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
          </div>

          {/* Extension / project tools (below the grid, kept accessible) */}
          {availableTools.filter((t) => t.type !== 'core').length > 0 && (
            <div style={{ marginTop: 18 }}>
              {['python', 'extension'].map((toolType) => {
                const tools = availableTools.filter((t) => t.type === toolType)
                if (tools.length === 0) return null
                const groups = tools.reduce<Record<string, ToolMeta[]>>((acc, t) => {
                  const key = t.extensionName ?? t.extensionId ?? (toolType === 'python' ? 'Project Tools' : 'Extension')
                  ;(acc[key] ??= []).push(t)
                  return acc
                }, {})
                return Object.entries(groups).map(([groupName, groupTools]) => (
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
                ))
              })}
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
      case 'dashboard':  return renderDashboard()
      case 'chat':       return renderAgent()
      case 'extensions': return renderExtensions()
      default: {
        const ext = getExtensionByViewId(activePage)
        if (ext?.SettingsView) {
          const ExtSettingsView = ext.SettingsView
          return <ExtSettingsView />
        }
        return (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>{sidebarItems.find((i) => i.id === activePage)?.label ?? activePage}</div>
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
          {sidebarItems.map((item) => {
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
          <div className={styles.sidebarFooter}>
            <div>SPECIMEN · CONFIG</div>
            <div style={{ fontStyle: 'italic', opacity: 0.6 }}>secrets · keychain</div>
          </div>
        </aside>

        {/* Main content */}
        <div className={styles.content}>
          <div className={styles.page}>
            {renderPage()}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className={styles.statusBar}>
        <span className={styles.statusSaved}>
          <span className={styles.statusDotSaved} />
          all changes saved
        </span>
        <span className={styles.statusSep}>│</span>
        <span>
          active provider: <span className={styles.statusProvider}>{activeProviderName}</span>
        </span>
        <span className={styles.statusSep}>│</span>
        <span>{models.length} model{models.length === 1 ? '' : 's'} cataloged</span>
        <div className={styles.statusBarRight}>
          <span className={styles.statusSpecimen}>cataloged · Rosa configurata</span>
          <span className={styles.statusSep}>│</span>
          <span style={{ letterSpacing: '1.2px' }}>ROSE</span>
        </div>
      </div>
    </div>
  )
}
