import { useEffect, useState, useCallback, useRef } from 'react'
import { ExtensionsTab } from './ExtensionsTab'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useEmailStore } from '../../stores/useEmailStore'
import { useDiscordStore } from '../../stores/useDiscordStore'
import { NavItem } from '../../../../shared/types'
import type { ModelConfig, CompressionConfig, ToolMeta } from '../../types/electron'
import styles from './SettingsView.module.css'

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

interface AudioDevice {
  deviceId: string
  label: string
}

const INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 30, 60]

const ANTHROPIC_FALLBACK = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
const OPENAI_FALLBACK = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini']
const BEDROCK_FALLBACK = [
  'anthropic.claude-opus-4-20250514-v1:0',
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'anthropic.claude-3-5-haiku-20241022-v1:0',
  'anthropic.claude-3-opus-20240229-v1:0',
  'meta.llama3-70b-instruct-v1:0',
  'meta.llama3-8b-instruct-v1:0',
  'amazon.titan-text-express-v1',
  'mistral.mistral-large-2402-v1:0'
]

export function SettingsView(): JSX.Element {
  const {
    heartbeatEnabled, heartbeatIntervalMinutes, micDeviceId,
    imapHost, imapPort, imapUser, imapPassword, imapTLS,
    discordBotToken,
    navItems, models, defaultModelId, providerKeys, router, compression, hostMode, update
  } = useSettingsStore()

  const rootPath = useProjectStore((s) => s.rootPath)
  const {
    channels: discordChannels_list,
    enabledChannelIds: discordEnabledIds,
    connected: discordConnected,
    toggleChannel: discordToggleChannel,
    loadChannels: discordRefreshChannels
  } = useDiscordStore()

  const [availableTools, setAvailableTools] = useState<ToolMeta[]>([])
  const [disabledTools, setDisabledTools] = useState<string[]>([])

  const [activePage, setActivePage] = useState('dashboard')
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [ollamaModels, setOllamaModels] = useState<Record<string, string[]>>({})
  const [ollamaFetching, setOllamaFetching] = useState<Record<string, boolean>>({})
  const [anthropicModels, setAnthropicModels] = useState<string[]>([])
  const [openaiModels, setOpenaiModels] = useState<string[]>([])
  const [anthropicFetching, setAnthropicFetching] = useState(false)
  const [openaiFetching, setOpenaiFetching] = useState(false)
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const { filters, loadFilters, saveFilters } = useEmailStore()
  const [newSpamType, setNewSpamType] = useState<'sender' | 'domain' | 'subject'>('sender')
  const [newSpamValue, setNewSpamValue] = useState('')
  const [newInjectionPattern, setNewInjectionPattern] = useState('')
  const [newInjectionIsRegex, setNewInjectionIsRegex] = useState(false)

  const [authStatus, setAuthStatus] = useState<{ loggedIn: boolean; email: string; plan: string }>({ loggedIn: false, email: '', plan: '' })
  const [authLoading, setAuthLoading] = useState(false)

  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState('')

  useEffect(() => {
    window.api.auth.getStatus().then(setAuthStatus).catch(() => {})
    return window.api.auth.onChanged((data) => {
      setAuthStatus((prev) => ({ ...prev, loggedIn: data.loggedIn, email: data.email }))
    })
  }, [])

  useEffect(() => {
    if (!rootPath) return
    Promise.all([
      window.api.tools.list(rootPath),
      window.api.project.getSettings(rootPath)
    ]).then(([tools, settings]) => {
      setAvailableTools(tools)
      setDisabledTools(settings.disabledTools)
    }).catch(() => {})
  }, [rootPath])

  const toggleTool = useCallback(async (name: string) => {
    if (!rootPath) return
    const updated = disabledTools.includes(name)
      ? disabledTools.filter((n) => n !== name)
      : [...disabledTools, name]
    setDisabledTools(updated)
    await window.api.project.setSettings(rootPath, { disabledTools: updated })
  }, [rootPath, disabledTools])

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

  const testImapConnection = useCallback(async () => {
    setTestState('testing')
    setTestError('')
    const result = await window.api.email.testConnection()
    if (result.ok) {
      setTestState('ok')
    } else {
      setTestState('fail')
      setTestError(result.error ?? 'Connection failed')
    }
  }, [])

  const handleNavDragStart = useCallback((index: number) => {
    dragIndexRef.current = index
  }, [])

  const handleNavDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleNavDrop = useCallback((dropIndex: number) => {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null
      setDragOverIndex(null)
      return
    }
    const reordered = [...navItems]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    dragIndexRef.current = null
    setDragOverIndex(null)
    update({ navItems: reordered })
  }, [navItems, update])

  const handleNavDragEnd = useCallback(() => {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }, [])

  const toggleNavItemVisible = useCallback((index: number) => {
    const updated: NavItem[] = navItems.map((item, i) =>
      i === index ? { ...item, visible: !item.visible } : item
    )
    update({ navItems: updated })
  }, [navItems, update])

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
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
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
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { data: { id: string }[] }
      const chat = data.data
        .map((m) => m.id)
        .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
        .sort()
      setOpenaiModels(chat)
    } catch {
      setOpenaiModels([])
    } finally {
      setOpenaiFetching(false)
    }
  }, [])

  useEffect(() => {
    loadAudioDevices()
  }, [loadAudioDevices])

  useEffect(() => {
    if (activePage === 'email') loadFilters()
  }, [activePage])

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
    if (compression.provider === 'ollama' && compression.baseUrl && !('__compression__' in ollamaModels)) {
      fetchOllamaModels('__compression__', compression.baseUrl)
    }
    if (providerKeys.anthropic && anthropicModels.length === 0) {
      fetchAnthropicModels(providerKeys.anthropic)
    }
    if (providerKeys.openai && openaiModels.length === 0) {
      fetchOpenAIModels(providerKeys.openai)
    }
  }, [activePage])

  // Views that have their own settings pages; all others show the placeholder or are skipped
  const SETTINGS_PAGES = new Set(['chat', 'heartbeat', 'rose-email', 'rose-discord'])

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard' },
    ...navItems
      .filter((n) => n.viewId !== 'settings' && n.visible && SETTINGS_PAGES.has(n.viewId))
      .map((n) => ({ id: n.viewId, label: n.label })),
    { id: 'extensions', label: 'Extensions' }
  ]

  useEffect(() => {
    if (activePage !== 'dashboard' && !sidebarItems.some((i) => i.id === activePage)) {
      setActivePage('dashboard')
    }
  }, [sidebarItems.map((i) => i.id).join(',')])

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
            {/* Settings is always last and always visible — not draggable */}
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
              <div className={styles.settingDesc}>
                Which microphone to use for voice-to-text in the chat input.
              </div>
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
        </section>
      </>
    )
  }

  function addModel(): void {
    const newModel: ModelConfig = {
      id: crypto.randomUUID(),
      displayName: '',
      provider: 'anthropic',
      modelName: '',
      baseUrl: '',
      tags: []
    }
    const updated = [...models, newModel]
    update({ models: updated, defaultModelId: updated.length === 1 ? newModel.id : defaultModelId })
  }

  function removeModel(id: string): void {
    const updated = models.filter((m) => m.id !== id)
    update({
      models: updated,
      defaultModelId: defaultModelId === id ? (updated[0]?.id ?? '') : defaultModelId
    })
  }

  function patchModel(id: string, patch: Partial<ModelConfig>): void {
    update({ models: models.map((m) => m.id === id ? { ...m, ...patch } : m) })
  }

  function renderModelSelect(
    key: string,
    provider: ModelConfig['provider'],
    value: string,
    onChange: (v: string) => void
  ): JSX.Element {
    if (provider === 'openai-compatible') {
      return (
        <input
          className={styles.input}
          type="text"
          placeholder="model name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }

    if (provider === 'bedrock') {
      return (
        <select
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!value && <option value="" disabled>Select a Bedrock model</option>}
          {value && !BEDROCK_FALLBACK.includes(value) && <option value={value}>{value}</option>}
          {BEDROCK_FALLBACK.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )
    }

    let options: string[]
    let isFetching: boolean
    let placeholder: string

    if (provider === 'anthropic') {
      isFetching = anthropicFetching
      options = anthropicModels.length > 0 ? anthropicModels : ANTHROPIC_FALLBACK
      placeholder = isFetching ? 'Loading…' : 'Select a model'
    } else if (provider === 'openai') {
      isFetching = openaiFetching
      options = openaiModels.length > 0 ? openaiModels : OPENAI_FALLBACK
      placeholder = isFetching ? 'Loading…' : 'Select a model'
    } else {
      isFetching = !!ollamaFetching[key]
      options = ollamaModels[key] ?? []
      placeholder = isFetching ? 'Loading…' : 'Enter Base URL to load models'
    }

    return (
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isFetching}
      >
        {!value && <option value="" disabled>{placeholder}</option>}
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }

  function renderChat(): JSX.Element {
    return (
      <>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Host</div>
          <div className={styles.hostToggle}>
            <button
              type="button"
              className={`${styles.hostToggleBtn} ${hostMode === 'projectrose' ? styles.hostToggleBtnActive : ''}`}
              onClick={() => update({ hostMode: 'projectrose' })}
            >
              ProjectRose
            </button>
            <button
              type="button"
              className={`${styles.hostToggleBtn} ${hostMode === 'self' ? styles.hostToggleBtnActive : ''}`}
              onClick={() => update({ hostMode: 'self' })}
            >
              Self
            </button>
          </div>
        </section>

        {hostMode === 'projectrose' && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>ProjectRose Account</div>
            {authStatus.loggedIn ? (
              <div className={styles.settingCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div className={styles.settingLabel}>Signed in as</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{authStatus.email}</div>
                  </div>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={async () => { setAuthLoading(true); await window.api.auth.logout(); setAuthLoading(false) }}
                    disabled={authLoading}
                  >
                    {authLoading ? 'Signing out...' : 'Sign Out'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.settingCard}>
                <div className={styles.settingLabel} style={{ marginBottom: 12 }}>
                  Sign in to use the managed AI endpoint — no API keys needed.
                </div>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled
                >
                  Sign In →
                </button>
                <div className={styles.settingDesc} style={{ marginTop: 8 }}>
                  The ProjectRose hosted service is currently being built. Check back soon.
                </div>
              </div>
            )}
          </section>
        )}

        {hostMode === 'self' && (
          <>
          <section className={styles.section}>
          <div className={styles.sectionTitle}>Provider API Keys</div>
          <div className={styles.settingCard}>
            <div className={styles.settingLabel}>Anthropic Key</div>
            <input
              className={styles.input}
              type="password"
              placeholder="sk-ant-..."
              value={providerKeys.anthropic}
              onChange={(e) => update({ providerKeys: { ...providerKeys, anthropic: e.target.value } })}
              onBlur={(e) => { setAnthropicModels([]); fetchAnthropicModels(e.target.value) }}
            />
            <div className={styles.settingLabel}>OpenAI Key</div>
            <input
              className={styles.input}
              type="password"
              placeholder="sk-..."
              value={providerKeys.openai}
              onChange={(e) => update({ providerKeys: { ...providerKeys, openai: e.target.value } })}
              onBlur={(e) => { setOpenaiModels([]); fetchOpenAIModels(e.target.value) }}
            />
            <div className={styles.settingLabel}>AWS Bedrock Region</div>
            <input
              className={styles.input}
              type="text"
              placeholder="us-east-1"
              value={providerKeys.bedrock?.region ?? 'us-east-1'}
              onChange={(e) => update({ providerKeys: { ...providerKeys, bedrock: { ...providerKeys.bedrock, region: e.target.value } } })}
            />
            <div className={styles.settingLabel}>AWS Access Key ID</div>
            <input
              className={styles.input}
              type="password"
              placeholder="AKIA..."
              value={providerKeys.bedrock?.accessKeyId ?? ''}
              onChange={(e) => update({ providerKeys: { ...providerKeys, bedrock: { ...providerKeys.bedrock, accessKeyId: e.target.value } } })}
            />
            <div className={styles.settingLabel}>AWS Secret Access Key</div>
            <input
              className={styles.input}
              type="password"
              placeholder="wJalrXUtn..."
              value={providerKeys.bedrock?.secretAccessKey ?? ''}
              onChange={(e) => update({ providerKeys: { ...providerKeys, bedrock: { ...providerKeys.bedrock, secretAccessKey: e.target.value } } })}
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Router Model</div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>Enable Router</div>
              <div className={styles.settingDesc}>
                A small local Ollama model that decides which model to use per request based on use-case tags.
              </div>
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${router.enabled ? styles.toggleOn : styles.toggleOff}`}
              onClick={() => update({ router: { ...router, enabled: !router.enabled } })}
              role="switch"
              aria-checked={router.enabled}
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
          {router.enabled && (
            <div className={styles.settingCard}>
              <div className={styles.settingLabel}>Base URL</div>
              <input
                className={styles.input}
                type="text"
                placeholder="http://localhost:11434"
                value={router.baseUrl}
                onChange={(e) => update({ router: { ...router, baseUrl: e.target.value } })}
                onBlur={(e) => fetchOllamaModels('__router__', e.target.value)}
              />
              <div className={styles.settingLabel}>Model</div>
              {renderModelSelect(
                '__router__',
                'ollama',
                router.modelName,
                (v) => update({ router: { ...router, modelName: v } })
              )}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Models</div>
          {models.length === 0 && (
            <div className={styles.emptyState}>No models configured. Add one below.</div>
          )}
          {models.map((m) => (
            <div key={m.id} className={styles.modelCard}>
              <div className={styles.modelCardHeader}>
                <label className={styles.modelDefaultRadio}>
                  <input
                    type="radio"
                    name="defaultModel"
                    checked={defaultModelId === m.id}
                    onChange={() => update({ defaultModelId: m.id })}
                  />
                  Default
                </label>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeModel(m.id)}
                >
                  Remove
                </button>
              </div>
              <div className={styles.settingLabel}>Provider</div>
              <select
                className={styles.select}
                value={m.provider}
                onChange={(e) => patchModel(m.id, { provider: e.target.value as ModelConfig['provider'], modelName: '' })}
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama (local)</option>
                <option value="openai-compatible">OpenAI-compatible</option>
                <option value="bedrock">AWS Bedrock</option>
              </select>
              {(m.provider === 'ollama' || m.provider === 'openai-compatible') && (
                <>
                  <div className={styles.settingLabel}>Base URL</div>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder={m.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                    value={m.baseUrl}
                    onChange={(e) => patchModel(m.id, { baseUrl: e.target.value })}
                    onBlur={(e) => m.provider === 'ollama' && fetchOllamaModels(m.id, e.target.value)}
                  />
                </>
              )}
              <div className={styles.settingLabel}>Model</div>
              {renderModelSelect(m.id, m.provider, m.modelName, (v) => patchModel(m.id, { modelName: v }))}
              <div className={styles.settingLabel}>Display Name</div>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Fast Local, Claude Opus"
                value={m.displayName}
                onChange={(e) => patchModel(m.id, { displayName: e.target.value })}
              />
              <div className={styles.settingLabel}>
                Use-Case Tags{' '}
                <span className={styles.labelNote}>(comma-separated, e.g. code, debugging)</span>
              </div>
              <input
                className={styles.input}
                type="text"
                placeholder="code, debugging, refactoring"
                value={m.id in tagInputs ? tagInputs[m.id] : m.tags.join(', ')}
                onChange={(e) => setTagInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                onBlur={(e) => {
                  patchModel(m.id, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })
                  setTagInputs((prev) => { const next = { ...prev }; delete next[m.id]; return next })
                }}
              />
            </div>
          ))}
          <button type="button" className={styles.addModelBtn} onClick={addModel}>
            + Add Model
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Compression Model</div>
          <div className={styles.settingCard}>
            <div className={styles.settingLabel}>Provider</div>
            <select
              className={styles.select}
              value={compression.provider}
              onChange={(e) => update({ compression: { ...compression, provider: e.target.value as CompressionConfig['provider'], modelName: '' } })}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (local)</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="bedrock">AWS Bedrock</option>
            </select>
            {(compression.provider === 'ollama' || compression.provider === 'openai-compatible') && (
              <>
                <div className={styles.settingLabel}>Base URL</div>
                <input
                  className={styles.input}
                  type="text"
                  placeholder={compression.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                  value={compression.baseUrl}
                  onChange={(e) => update({ compression: { ...compression, baseUrl: e.target.value } })}
                  onBlur={(e) => compression.provider === 'ollama' && fetchOllamaModels('__compression__', e.target.value)}
                />
              </>
            )}
            <div className={styles.settingLabel}>Model</div>
            {renderModelSelect(
              '__compression__',
              compression.provider,
              compression.modelName,
              (v) => update({ compression: { ...compression, modelName: v } })
            )}
          </div>
        </section>
          </>
        )}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Tools</div>
          {availableTools.filter((t) => t.type === 'core').map((tool) => {
            const enabled = !disabledTools.includes(tool.name)
            return (
              <div key={tool.name} className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>{tool.displayName}</div>
                  <div className={styles.settingDesc}>{tool.description}</div>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${enabled ? styles.toggleOn : styles.toggleOff}`}
                  onClick={() => toggleTool(tool.name)}
                  role="switch"
                  aria-checked={enabled}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            )
          })}
          {availableTools.filter((t) => t.type === 'python').length > 0 && (
            <>
              <div className={styles.settingLabel} style={{ marginTop: 12 }}>Project Tools</div>
              {availableTools.filter((t) => t.type === 'python').map((tool) => {
                const enabled = !disabledTools.includes(tool.name)
                return (
                  <div key={tool.name} className={styles.settingRow}>
                    <div className={styles.settingInfo}>
                      <div className={styles.settingLabel}>{tool.displayName}</div>
                      <div className={styles.settingDesc}>{tool.description}</div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.toggle} ${enabled ? styles.toggleOn : styles.toggleOff}`}
                      onClick={() => toggleTool(tool.name)}
                      role="switch"
                      aria-checked={enabled}
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </section>

      </>
    )
  }

  function renderHeartbeat(): JSX.Element {
    return (
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Heartbeat</div>

        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>Enable Heartbeat</div>
            <div className={styles.settingDesc}>
              Automatically process notes and execute due tasks in the background.
            </div>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${heartbeatEnabled ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => update({ heartbeatEnabled: !heartbeatEnabled })}
            role="switch"
            aria-checked={heartbeatEnabled}
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>

        <div className={`${styles.settingRow} ${!heartbeatEnabled ? styles.disabled : ''}`}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>Run Every</div>
            <div className={styles.settingDesc}>
              How often the heartbeat checks for notes and due tasks.
            </div>
          </div>
          <div className={styles.intervalGroup}>
            {INTERVAL_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                className={`${styles.intervalBtn} ${heartbeatIntervalMinutes === min ? styles.intervalActive : ''}`}
                onClick={() => update({ heartbeatIntervalMinutes: min })}
                disabled={!heartbeatEnabled}
              >
                {min < 60 ? `${min}m` : '1h'}
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  function renderEmail(): JSX.Element {
    const spamRules = filters?.spamRules ?? []
    const injectionPatterns = filters?.injectionPatterns ?? []
    const customFolders = filters?.customFolders ?? []

    async function addSpamRule(): Promise<void> {
      const value = newSpamValue.trim()
      if (!value) return
      const rule = { id: `sr-${Date.now()}`, type: newSpamType, value, enabled: true }
      await saveFilters({ spamRules: [...spamRules, rule] })
      setNewSpamValue('')
    }

    async function removeSpamRule(id: string): Promise<void> {
      await saveFilters({ spamRules: spamRules.filter(r => r.id !== id) })
    }

    async function toggleSpamRule(id: string): Promise<void> {
      await saveFilters({ spamRules: spamRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) })
    }

    async function toggleInjectionPattern(id: string): Promise<void> {
      await saveFilters({ injectionPatterns: injectionPatterns.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p) })
    }

    async function addInjectionPattern(): Promise<void> {
      const value = newInjectionPattern.trim()
      if (!value) return
      const pattern = { id: `ip-${Date.now()}`, pattern: value, isRegex: newInjectionIsRegex, enabled: true, builtin: false }
      await saveFilters({ injectionPatterns: [...injectionPatterns, pattern] })
      setNewInjectionPattern('')
      setNewInjectionIsRegex(false)
    }

    async function removeInjectionPattern(id: string): Promise<void> {
      await saveFilters({ injectionPatterns: injectionPatterns.filter(p => p.id !== id) })
    }

    return (
      <>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Email (IMAP)</div>
          <div className={styles.settingCard}>
            <div className={styles.settingLabel}>Server</div>
            <div className={styles.inputRow}>
              <input
                className={`${styles.input} ${styles.inputRowFlex}`}
                type="text"
                placeholder="imap.gmail.com"
                value={imapHost}
                onChange={(e) => { update({ imapHost: e.target.value }); setTestState('idle') }}
              />
              <input
                className={`${styles.input} ${styles.inputNarrow}`}
                type="number"
                placeholder="993"
                value={imapPort}
                onChange={(e) => { update({ imapPort: Number(e.target.value) }); setTestState('idle') }}
              />
            </div>
            <div className={styles.settingLabel}>Email Address</div>
            <input
              className={styles.input}
              type="text"
              placeholder="you@example.com"
              value={imapUser}
              onChange={(e) => { update({ imapUser: e.target.value }); setTestState('idle') }}
            />
            <div className={styles.settingLabel}>Password / App Password</div>
            <input
              className={styles.input}
              type="password"
              placeholder="••••••••"
              value={imapPassword}
              onChange={(e) => { update({ imapPassword: e.target.value }); setTestState('idle') }}
            />
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={imapTLS}
                onChange={(e) => update({ imapTLS: e.target.checked })}
              />
              Use TLS (recommended)
            </label>
            <div className={styles.inputRow}>
              <button
                type="button"
                className={styles.testBtn}
                onClick={testImapConnection}
                disabled={testState === 'testing' || !imapHost || !imapUser}
              >
                {testState === 'testing' ? 'Testing…' : 'Test Connection'}
              </button>
              {testState === 'ok' && <span className={styles.testOk}>Connected</span>}
              {testState === 'fail' && <span className={styles.testFail}>{testError}</span>}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Spam Rules</div>
          <div className={styles.settingDesc} style={{ marginBottom: 10 }}>
            Emails matching any rule go to the Spam folder immediately, skipping AI classification.
          </div>
          {spamRules.map(rule => (
            <div key={rule.id} className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={styles.filterRuleType}>{rule.type}</span>
                <span className={styles.settingLabel}>{rule.value}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className={`${styles.toggle} ${rule.enabled ? styles.toggleOn : styles.toggleOff}`}
                  onClick={() => toggleSpamRule(rule.id)}
                  role="switch"
                  aria-checked={rule.enabled}
                >
                  <span className={styles.toggleThumb} />
                </button>
                <button type="button" className={styles.removeBtn} onClick={() => removeSpamRule(rule.id)}>Remove</button>
              </div>
            </div>
          ))}
          <div className={styles.inputRow} style={{ marginTop: 8 }}>
            <select
              className={styles.select}
              value={newSpamType}
              onChange={(e) => setNewSpamType(e.target.value as 'sender' | 'domain' | 'subject')}
              style={{ width: 100, flexShrink: 0 }}
            >
              <option value="sender">Sender</option>
              <option value="domain">Domain</option>
              <option value="subject">Subject</option>
            </select>
            <input
              className={`${styles.input} ${styles.inputRowFlex}`}
              type="text"
              placeholder={newSpamType === 'domain' ? 'example.com' : newSpamType === 'sender' ? 'spam@example.com' : 'limited time offer'}
              value={newSpamValue}
              onChange={(e) => setNewSpamValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSpamRule() }}
            />
            <button type="button" className={styles.addModelBtn} onClick={addSpamRule} disabled={!newSpamValue.trim()}>
              + Add
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Injection Filters</div>
          <div className={styles.settingDesc} style={{ marginBottom: 10 }}>
            Emails matching any pattern are quarantined. Built-in patterns detect common prompt injection phrases.
          </div>
          {injectionPatterns.map(p => (
            <div key={p.id} className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <div className={styles.settingLabel}>
                  {p.pattern}
                  {p.isRegex && <span className={styles.filterRuleType} style={{ marginLeft: 6 }}>regex</span>}
                  {p.builtin && <span className={styles.filterRuleType} style={{ marginLeft: 6 }}>built-in</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className={`${styles.toggle} ${p.enabled ? styles.toggleOn : styles.toggleOff}`}
                  onClick={() => toggleInjectionPattern(p.id)}
                  role="switch"
                  aria-checked={p.enabled}
                >
                  <span className={styles.toggleThumb} />
                </button>
                {!p.builtin && (
                  <button type="button" className={styles.removeBtn} onClick={() => removeInjectionPattern(p.id)}>Remove</button>
                )}
              </div>
            </div>
          ))}
          <div className={styles.inputRow} style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
            <input
              className={`${styles.input} ${styles.inputRowFlex}`}
              type="text"
              placeholder="Pattern text or regex…"
              value={newInjectionPattern}
              onChange={(e) => setNewInjectionPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addInjectionPattern() }}
            />
            <label className={styles.checkboxRow} style={{ whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={newInjectionIsRegex}
                onChange={(e) => setNewInjectionIsRegex(e.target.checked)}
              />
              Regex
            </label>
            <button type="button" className={styles.addModelBtn} onClick={addInjectionPattern} disabled={!newInjectionPattern.trim()}>
              + Add
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Folders</div>
          <div className={styles.settingDesc}>
            Custom folders are created and managed from the folder sidebar in the Email view.
            {customFolders.length === 0
              ? ' No custom folders yet.'
              : ` ${customFolders.length} custom folder${customFolders.length === 1 ? '' : 's'}: ${customFolders.map(f => f.name).join(', ')}.`}
          </div>
        </section>
      </>
    )
  }

  function renderPlaceholder(): JSX.Element {
    const current = sidebarItems.find((i) => i.id === activePage)
    return (
      <section className={styles.section}>
        <div className={styles.sectionTitle}>{current?.label ?? activePage}</div>
        <div className={styles.emptyState}>No settings available for this section yet.</div>
      </section>
    )
  }

  function renderExtensions(): JSX.Element {
    return (
      <ExtensionsTab />
    )
  }

  function renderDiscord(): JSX.Element {
    const guilds = Array.from(new Map(discordChannels_list.map((c) => [c.guildId, c.guildName])).entries())

    return (
      <>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Discord Bot</div>
          <div className={styles.settingCard}>
            <div className={styles.settingLabel}>Bot Token</div>
            <div className={styles.settingDesc}>
              Create a bot at discord.com/developers, enable the Guilds, GuildMessages, and MessageContent
              (privileged) intents, invite the bot to your servers, then paste the token below.
            </div>
            <input
              className={styles.input}
              type="password"
              placeholder="Bot token…"
              value={discordBotToken}
              onChange={(e) => update({ discordBotToken: e.target.value })}
            />
            <div className={styles.settingDesc} style={{ marginTop: 8 }}>
              Status: {discordConnected ? '● Connected' : '○ Disconnected'}
            </div>
          </div>
        </section>

        {discordBotToken && (
          <section className={styles.section}>
            <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Visible Channels
              <button className={styles.testBtn} onClick={() => discordRefreshChannels()}>Refresh</button>
            </div>
            <div className={styles.settingDesc} style={{ marginBottom: 8 }}>
              Checked channels appear in the Discord view and are accessible to the AI tools.
            </div>
            {discordChannels_list.length === 0 && (
              <div className={styles.emptyState}>No channels found. Make sure the bot is connected.</div>
            )}
            {guilds.map(([guildId, guildName]) => (
              <div key={guildId} className={styles.settingCard}>
                <div className={styles.settingLabel}>{guildName}</div>
                {discordChannels_list.filter((c) => c.guildId === guildId).map((ch) => (
                  <label key={ch.id} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={discordEnabledIds.includes(ch.id)}
                      onChange={() => discordToggleChannel(ch.id)}
                    />
                    <span># {ch.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </section>
        )}
      </>
    )
  }

  function renderPage(): JSX.Element {
    switch (activePage) {
      case 'dashboard': return renderDashboard()
      case 'chat': return renderChat()
      case 'heartbeat': return renderHeartbeat()
      case 'rose-email': return renderEmail()
      case 'rose-discord': return renderDiscord()
      case 'extensions': return renderExtensions()
      default: return renderPlaceholder()
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLabel}>Settings</div>
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.sidebarItem} ${activePage === item.id ? styles.sidebarItemActive : ''}`}
            onClick={() => setActivePage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>
      <div className={styles.content}>
        <div className={styles.page}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
