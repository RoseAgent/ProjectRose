import { useEffect, useState, useCallback, useRef } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { NavItem } from '../../../../shared/types'
import type { ModelConfig } from '../../types/electron'
import styles from './SettingsView.module.css'

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

interface AudioDevice {
  deviceId: string
  label: string
}

interface ServiceHealth {
  name: string
  url: string
  status: 'up' | 'down' | 'checking'
  latency?: number
}

const INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 30, 60]

const ANTHROPIC_FALLBACK = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
const OPENAI_FALLBACK = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini']

export function SettingsView(): JSX.Element {
  const {
    heartbeatEnabled, heartbeatIntervalMinutes, micDeviceId,
    imapHost, imapPort, imapUser, imapPassword, imapTLS, navItems,
    models, defaultModelId, providerKeys, router, compression, update
  } = useSettingsStore()

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
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState('')
  const [services, setServices] = useState<ServiceHealth[]>([
    { name: 'RoseLibrary', url: 'http://127.0.0.1:8000', status: 'checking' },
    { name: 'RoseTrainer', url: 'http://127.0.0.1:8030', status: 'checking' }
  ])

  const checkHealth = useCallback(async () => {
    setServices((prev) => prev.map((s) => ({ ...s, status: 'checking' as const })))
    const results = await window.api.checkServicesHealth()
    setServices(results.map((r) => ({ ...r, status: r.status as 'up' | 'down' | 'checking' })))
  }, [])

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
    checkHealth()
    loadAudioDevices()
  }, [checkHealth, loadAudioDevices])

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

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard' },
    ...navItems
      .filter((n) => n.viewId !== 'settings' && n.visible)
      .map((n) => ({ id: n.viewId, label: n.label }))
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
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Service Health</div>
            <button type="button" className={styles.refreshBtn} onClick={checkHealth}>Refresh</button>
          </div>
          <div className={styles.serviceList}>
            {services.map((svc) => (
              <div key={svc.name} className={styles.serviceRow}>
                <span className={`${styles.dot} ${
                  svc.status === 'up' ? styles.dotUp :
                  svc.status === 'down' ? styles.dotDown :
                  styles.dotChecking
                }`} />
                <span className={styles.serviceName}>{svc.name}</span>
                <span className={styles.serviceUrl}>{svc.url}</span>
                <span className={styles.serviceStatus}>
                  {svc.status === 'checking' && 'Checking…'}
                  {svc.status === 'up' && `Online${svc.latency != null ? ` · ${svc.latency}ms` : ''}`}
                  {svc.status === 'down' && 'Offline'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Navigation Bar</div>
          <div className={styles.navList}>
            {navItems.map((item, index) => (
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
                {item.viewId === 'settings' ? (
                  <span className={styles.navItemLocked}>always visible</span>
                ) : (
                  <button
                    type="button"
                    className={`${styles.toggle} ${item.visible ? styles.toggleOn : styles.toggleOff}`}
                    onClick={() => toggleNavItemVisible(index)}
                    role="switch"
                    aria-checked={item.visible}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                )}
              </div>
            ))}
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
              onChange={(e) => update({ compression: { ...compression, provider: e.target.value as ModelConfig['provider'], modelName: '' } })}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (local)</option>
              <option value="openai-compatible">OpenAI-compatible</option>
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
    return (
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

  function renderPage(): JSX.Element {
    switch (activePage) {
      case 'dashboard': return renderDashboard()
      case 'chat': return renderChat()
      case 'heartbeat': return renderHeartbeat()
      case 'email': return renderEmail()
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
