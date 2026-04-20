import { useEffect, useState, useCallback, useRef } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { NavItem } from '../../../../shared/types'
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

export function SettingsView(): JSX.Element {
  const {
    heartbeatEnabled, heartbeatIntervalMinutes, micDeviceId,
    imapHost, imapPort, imapUser, imapPassword, imapTLS, navItems,
    llmProvider, llmModel, llmApiKey, llmBaseUrl, llmCompressModel, update
  } = useSettingsStore()

  const [activePage, setActivePage] = useState('dashboard')
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

  useEffect(() => {
    checkHealth()
    loadAudioDevices()
  }, [checkHealth, loadAudioDevices])

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

  function renderChat(): JSX.Element {
    return (
      <>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>LLM</div>
          <div className={styles.settingCard}>
            <div className={styles.settingLabel}>Provider</div>
            <select
              className={styles.select}
              value={llmProvider}
              onChange={(e) => update({ llmProvider: e.target.value as 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' })}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (local)</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>

            <div className={styles.settingLabel}>Model</div>
            <input
              className={styles.input}
              type="text"
              placeholder={llmProvider === 'anthropic' ? 'claude-sonnet-4-6' : llmProvider === 'openai' ? 'gpt-4o' : 'model name'}
              value={llmModel}
              onChange={(e) => update({ llmModel: e.target.value })}
            />

            {llmProvider !== 'ollama' && (
              <>
                <div className={styles.settingLabel}>API Key</div>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="••••••••"
                  value={llmApiKey}
                  onChange={(e) => update({ llmApiKey: e.target.value })}
                />
              </>
            )}

            {(llmProvider === 'ollama' || llmProvider === 'openai-compatible') && (
              <>
                <div className={styles.settingLabel}>Base URL</div>
                <input
                  className={styles.input}
                  type="text"
                  placeholder={llmProvider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
                  value={llmBaseUrl}
                  onChange={(e) => update({ llmBaseUrl: e.target.value })}
                />
              </>
            )}

            <div className={styles.settingLabel}>
              Compression Model{' '}
              <span className={styles.labelNote}>(optional, defaults to Model above)</span>
            </div>
            <input
              className={styles.input}
              type="text"
              placeholder="leave blank to use same model"
              value={llmCompressModel}
              onChange={(e) => update({ llmCompressModel: e.target.value })}
            />
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
