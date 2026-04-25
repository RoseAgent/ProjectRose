import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '@renderer/stores/useSettingsStore'
import type { SpamRule, InjectionPattern, EmailFilters } from './store'

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

const s: Record<string, React.CSSProperties> = {
  section: { marginBottom: 24 },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)', marginBottom: 12 },
  card: { display: 'flex', flexDirection: 'column' as const, gap: 8, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 6px)', background: 'var(--color-bg-secondary)' },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginTop: 4 },
  desc: { fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 },
  input: { width: '100%', padding: '6px 10px', background: 'var(--color-input-bg, var(--color-bg))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm, 4px)', color: 'var(--color-text-primary)', fontSize: 13, boxSizing: 'border-box' as const },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' },
  rowFlex: { display: 'flex', gap: 8, alignItems: 'center' },
  btn: { padding: '6px 14px', background: 'var(--color-button-bg, var(--color-bg-secondary))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm, 4px)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnDanger: { color: 'var(--color-error, #e55)' },
  tagBadge: { fontSize: 11, padding: '2px 8px', background: 'var(--color-bg-tertiary, var(--color-bg-secondary))', border: '1px solid var(--color-border)', borderRadius: '3px', color: 'var(--color-text-muted)' },
  testOk: { fontSize: 12, color: 'var(--color-success, #3a3)', fontWeight: 500 },
  testFail: { fontSize: 12, color: 'var(--color-error, #e55)' },
  checkbox: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer' },
  select: { padding: '6px 10px', background: 'var(--color-input-bg, var(--color-bg))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm, 4px)', color: 'var(--color-text-primary)', fontSize: 13 },
}

export function EmailSettings(): JSX.Element {
  const { imapHost, imapPort, imapUser, imapPassword, imapTLS, update } = useSettingsStore()
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState('')
  const [filters, setFilters] = useState<EmailFilters | null>(null)
  const [newSpamType, setNewSpamType] = useState<'sender' | 'domain' | 'subject'>('sender')
  const [newSpamValue, setNewSpamValue] = useState('')
  const [newInjectionPattern, setNewInjectionPattern] = useState('')
  const [newInjectionIsRegex, setNewInjectionIsRegex] = useState(false)

  const loadFilters = useCallback(async () => {
    try {
      const f = await window.api.invoke('rose-email:loadFilters') as EmailFilters
      setFilters(f)
    } catch { /* extension not loaded */ }
  }, [])

  useEffect(() => { loadFilters() }, [loadFilters])

  async function saveFilters(patch: Partial<EmailFilters>): Promise<void> {
    const updated = await window.api.invoke('rose-email:saveFilters', patch) as EmailFilters
    setFilters(updated)
  }

  async function testConnection(): Promise<void> {
    setTestState('testing')
    setTestError('')
    const result = await window.api.invoke('rose-email:testConnection') as { ok: boolean; error?: string }
    setTestState(result.ok ? 'ok' : 'fail')
    if (!result.ok) setTestError(result.error ?? 'Connection failed')
  }

  const spamRules = filters?.spamRules ?? []
  const injectionPatterns = filters?.injectionPatterns ?? []
  const customFolders = filters?.customFolders ?? []

  async function addSpamRule(): Promise<void> {
    const value = newSpamValue.trim()
    if (!value) return
    await saveFilters({ spamRules: [...spamRules, { id: `sr-${Date.now()}`, type: newSpamType, value, enabled: true }] })
    setNewSpamValue('')
  }

  async function addInjectionPattern(): Promise<void> {
    const value = newInjectionPattern.trim()
    if (!value) return
    await saveFilters({ injectionPatterns: [...injectionPatterns, { id: `ip-${Date.now()}`, pattern: value, isRegex: newInjectionIsRegex, enabled: true, builtin: false }] })
    setNewInjectionPattern('')
    setNewInjectionIsRegex(false)
  }

  return (
    <div>
      <div style={s.section}>
        <div style={s.title}>Email (IMAP)</div>
        <div style={s.card}>
          <div style={s.label}>Server</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...s.input, flex: 1 }} type="text" placeholder="imap.gmail.com"
              value={imapHost} onChange={(e) => { update({ imapHost: e.target.value }); setTestState('idle') }} />
            <input style={{ ...s.input, width: 80 }} type="number" placeholder="993"
              value={imapPort} onChange={(e) => { update({ imapPort: Number(e.target.value) }); setTestState('idle') }} />
          </div>
          <div style={s.label}>Email Address</div>
          <input style={s.input} type="text" placeholder="you@example.com"
            value={imapUser} onChange={(e) => { update({ imapUser: e.target.value }); setTestState('idle') }} />
          <div style={s.label}>Password / App Password</div>
          <input style={s.input} type="password" placeholder="••••••••"
            value={imapPassword} onChange={(e) => { update({ imapPassword: e.target.value }); setTestState('idle') }} />
          <label style={s.checkbox}>
            <input type="checkbox" checked={imapTLS} onChange={(e) => update({ imapTLS: e.target.checked })} />
            Use TLS (recommended)
          </label>
          <div style={s.rowFlex}>
            <button style={s.btn} onClick={testConnection} disabled={testState === 'testing' || !imapHost || !imapUser}>
              {testState === 'testing' ? 'Testing…' : 'Test Connection'}
            </button>
            {testState === 'ok' && <span style={s.testOk}>Connected</span>}
            {testState === 'fail' && <span style={s.testFail}>{testError}</span>}
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.title}>Spam Rules</div>
        <div style={{ ...s.desc, marginBottom: 10 }}>Emails matching any rule go to Spam immediately, skipping AI classification.</div>
        {spamRules.map((rule: SpamRule) => (
          <div key={rule.id} style={s.row}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
              <span style={s.tagBadge}>{rule.type}</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{rule.value}</span>
            </div>
            <div style={s.rowFlex}>
              <button style={s.btn} onClick={() => saveFilters({ spamRules: spamRules.map((r: SpamRule) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r) })}>
                {rule.enabled ? 'Disable' : 'Enable'}
              </button>
              <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => saveFilters({ spamRules: spamRules.filter((r: SpamRule) => r.id !== rule.id) })}>Remove</button>
            </div>
          </div>
        ))}
        <div style={{ ...s.rowFlex, marginTop: 8 }}>
          <select style={s.select} value={newSpamType} onChange={(e) => setNewSpamType(e.target.value as typeof newSpamType)}>
            <option value="sender">Sender</option>
            <option value="domain">Domain</option>
            <option value="subject">Subject</option>
          </select>
          <input style={{ ...s.input, flex: 1 }} type="text"
            placeholder={newSpamType === 'domain' ? 'example.com' : newSpamType === 'sender' ? 'spam@example.com' : 'limited time offer'}
            value={newSpamValue} onChange={(e) => setNewSpamValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSpamRule() }} />
          <button style={s.btn} onClick={addSpamRule} disabled={!newSpamValue.trim()}>+ Add</button>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.title}>Injection Filters</div>
        <div style={{ ...s.desc, marginBottom: 10 }}>Emails matching any pattern are quarantined. Built-in patterns detect common prompt injection phrases.</div>
        {injectionPatterns.map((p: InjectionPattern) => (
          <div key={p.id} style={s.row}>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', display: 'flex', gap: 6, alignItems: 'center' }}>
              {p.pattern}
              {p.isRegex && <span style={s.tagBadge}>regex</span>}
              {p.builtin && <span style={s.tagBadge}>built-in</span>}
            </div>
            <div style={s.rowFlex}>
              <button style={s.btn} onClick={() => saveFilters({ injectionPatterns: injectionPatterns.map((ip: InjectionPattern) => ip.id === p.id ? { ...ip, enabled: !ip.enabled } : ip) })}>
                {p.enabled ? 'Disable' : 'Enable'}
              </button>
              {!p.builtin && (
                <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => saveFilters({ injectionPatterns: injectionPatterns.filter((ip: InjectionPattern) => ip.id !== p.id) })}>Remove</button>
              )}
            </div>
          </div>
        ))}
        <div style={{ ...s.rowFlex, marginTop: 8, flexWrap: 'wrap' as const }}>
          <input style={{ ...s.input, flex: 1, minWidth: 180 }} type="text" placeholder="Pattern text or regex…"
            value={newInjectionPattern} onChange={(e) => setNewInjectionPattern(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addInjectionPattern() }} />
          <label style={s.checkbox}>
            <input type="checkbox" checked={newInjectionIsRegex} onChange={(e) => setNewInjectionIsRegex(e.target.checked)} />
            Regex
          </label>
          <button style={s.btn} onClick={addInjectionPattern} disabled={!newInjectionPattern.trim()}>+ Add</button>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.title}>Folders</div>
        <div style={s.desc}>
          Custom folders are created and managed from the folder sidebar in the Email view.
          {customFolders.length === 0
            ? ' No custom folders yet.'
            : ` ${customFolders.length} custom folder${customFolders.length === 1 ? '' : 's'}: ${customFolders.map((f) => f.name).join(', ')}.`}
        </div>
      </div>
    </div>
  )
}
