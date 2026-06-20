import { useCallback, useEffect, useState } from 'react'
import Editor, { type OnMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useProjectStore } from '../../stores/useProjectStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { roseDarkTheme, roseHerbariumTheme } from '../../themes/monacoThemes'
import styles from './SettingsView.module.css'

loader.config({ monaco })

let themesRegisteredHere = false

interface ExtensionRow {
  id: string
  name: string
  extensionEnabled: boolean
  hasDefault: boolean
  hasUserFile: boolean
  expanded: boolean
  loaded: boolean
  content: string
  original: string
  source: 'user' | 'default' | 'none'
  dirty: boolean
  saving: boolean
}

function MarkdownPromptEditor({
  value,
  onChange,
  height = 320
}: {
  value: string
  onChange: (next: string) => void
  height?: number
}): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const monacoTheme = theme === 'dark' ? 'rose-dark' : 'rose-herbarium'

  const handleMount: OnMount = (_editor, monacoInstance) => {
    if (!themesRegisteredHere) {
      monacoInstance.editor.defineTheme('rose-dark', roseDarkTheme)
      monacoInstance.editor.defineTheme('rose-herbarium', roseHerbariumTheme)
      themesRegisteredHere = true
    }
    monacoInstance.editor.setTheme(monacoTheme)
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)' }}>
      <Editor
        height={`${height}px`}
        language="markdown"
        value={value}
        theme={monacoTheme}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={editorOptions(theme)}
      />
    </div>
  )
}

// Read-only panel for a host-injected region of the prompt, rendered directly
// above (header) or below (footer) the editable identity editor. Kept entirely
// outside Monaco so it can never interfere with editing; styled to read as a
// continuous, locked extension of the same prompt file.
function InjectedSectionPanel({
  text,
  theme,
  position
}: {
  text: string
  theme: string
  position: 'header' | 'footer'
}): JSX.Element {
  const mono = theme === 'dark'
    ? "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace"
    : "'IBM Plex Mono', ui-monospace, monospace"
  const isHeader = position === 'header'
  const label = isHeader
    ? '▲ Injected from settings · read-only'
    : '▼ Injected into the system prompt at runtime · read-only'
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        [isHeader ? 'borderBottom' : 'borderTop']: 'none',
        background: 'var(--color-bg-secondary, rgba(127,127,127,0.06))',
        borderLeft: '2px solid var(--color-accent)',
        padding: '10px 14px 12px'
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        {label}
      </div>
      <pre style={{ margin: 0, fontFamily: mono, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>
        {text.trim()}
      </pre>
    </div>
  )
}

function editorOptions(theme: string): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    fontFamily: theme === 'dark'
      ? "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace"
      : "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: 13,
    lineHeight: 20,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    renderLineHighlight: 'none',
    glyphMargin: false,
    folding: false,
    lineNumbers: 'off',
    padding: { top: 12, bottom: 12 }
  }
}

export function PromptsTab(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath)
  const theme = useThemeStore((s) => s.theme)

  const [roseContent, setRoseContent] = useState('')
  const [roseOriginal, setRoseOriginal] = useState('')
  const [roseInjected, setRoseInjected] = useState<{ header: string; footer: string }>({ header: '', footer: '' })
  const [roseExpanded, setRoseExpanded] = useState(true)
  const [roseSaving, setRoseSaving] = useState(false)

  const [rows, setRows] = useState<ExtensionRow[]>([])
  const [disabledPrompts, setDisabledPrompts] = useState<string[]>([])
  const [confirmReset, setConfirmReset] = useState<{ id: string; name: string } | null>(null)

  const refreshList = useCallback(async () => {
    if (!rootPath) { setRows([]); return }
    const list = await window.api.prompts.listExtension(rootPath)
    setRows((prev) => list.map((row) => {
      const existing = prev.find((p) => p.id === row.id)
      return {
        id: row.id,
        name: row.name,
        extensionEnabled: row.extensionEnabled,
        hasDefault: row.hasDefault,
        hasUserFile: row.hasUserFile,
        expanded: existing?.expanded ?? false,
        loaded: existing?.loaded ?? false,
        content: existing?.content ?? '',
        original: existing?.original ?? '',
        source: existing?.source ?? 'none',
        dirty: existing?.dirty ?? false,
        saving: false
      }
    }))
  }, [rootPath])

  const refreshInjected = useCallback(async () => {
    if (!rootPath) return
    try {
      setRoseInjected(await window.api.prompts.readInjected(rootPath))
    } catch (err) {
      console.error('[prompts] failed to load injected sections', err)
    }
  }, [rootPath])

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    // Load each source independently — the ROSE.md identity must still render
    // even if project settings or the injected-sections build fails, otherwise
    // a failure in one blanks the whole editor.
    void (async () => {
      try {
        const roseText = await window.api.prompts.readRose()
        if (cancelled) return
        setRoseContent(roseText)
        setRoseOriginal(roseText)
      } catch (err) {
        console.error('[prompts] failed to load ROSE.md', err)
      }
    })()
    void (async () => {
      try {
        const settings = await window.api.project.getSettings(rootPath)
        if (cancelled) return
        setDisabledPrompts(settings.disabledPrompts)
      } catch (err) {
        console.error('[prompts] failed to load project settings', err)
      }
    })()
    void refreshInjected()
    void refreshList()
    return () => { cancelled = true }
  }, [rootPath, refreshList, refreshInjected])

  const loadRowContent = useCallback(async (id: string) => {
    if (!rootPath) return
    const result = await window.api.prompts.readExtension(rootPath, id)
    setRows((prev) => prev.map((r) => r.id === id
      ? { ...r, loaded: true, content: result.content, original: result.content, source: result.source, dirty: false }
      : r
    ))
  }, [rootPath])

  const toggleRowExpanded = useCallback(async (id: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, expanded: !r.expanded } : r))
    const row = rows.find((r) => r.id === id)
    if (row && !row.loaded) await loadRowContent(id)
  }, [rows, loadRowContent])

  const updateRowContent = useCallback((id: string, next: string) => {
    setRows((prev) => prev.map((r) => r.id === id
      ? { ...r, content: next, dirty: next !== r.original }
      : r
    ))
  }, [])

  const saveRow = useCallback(async (id: string) => {
    if (!rootPath) return
    const row = rows.find((r) => r.id === id)
    if (!row) return
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, saving: true } : r))
    try {
      await window.api.prompts.writeExtension(rootPath, id, row.content)
      setRows((prev) => prev.map((r) => r.id === id
        ? { ...r, original: r.content, dirty: false, source: 'user', hasUserFile: true, saving: false }
        : r
      ))
      void refreshInjected()
    } catch (err) {
      console.error('[prompts] save failed', err)
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, saving: false } : r))
    }
  }, [rootPath, rows, refreshInjected])

  const discardRow = useCallback((id: string) => {
    setRows((prev) => prev.map((r) => r.id === id
      ? { ...r, content: r.original, dirty: false }
      : r
    ))
  }, [])

  const resetRow = useCallback(async (id: string) => {
    if (!rootPath) return
    await window.api.prompts.resetExtension(rootPath, id)
    const result = await window.api.prompts.readExtension(rootPath, id)
    setRows((prev) => prev.map((r) => r.id === id
      ? { ...r, content: result.content, original: result.content, source: result.source, dirty: false, hasUserFile: false }
      : r
    ))
    void refreshInjected()
  }, [rootPath, refreshInjected])

  const togglePromptEnabled = useCallback(async (id: string) => {
    if (!rootPath) return
    const next = disabledPrompts.includes(id)
      ? disabledPrompts.filter((d) => d !== id)
      : [...disabledPrompts, id]
    setDisabledPrompts(next)
    await window.api.project.setSettings(rootPath, { disabledPrompts: next })
    void refreshInjected()
  }, [rootPath, disabledPrompts, refreshInjected])

  const saveRose = useCallback(async () => {
    setRoseSaving(true)
    try {
      await window.api.prompts.writeRose(roseContent)
      setRoseOriginal(roseContent)
    } catch (err) {
      console.error('[prompts] rose save failed', err)
    } finally {
      setRoseSaving(false)
    }
  }, [roseContent])

  const discardRose = useCallback(() => {
    setRoseContent(roseOriginal)
  }, [roseOriginal])

  if (!rootPath) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Prompts</div>
        <div className={styles.emptyState}>Open a project to edit prompts.</div>
      </section>
    )
  }

  const roseDirty = roseContent !== roseOriginal

  // SettingsView already wraps renderPage() in `<div className={styles.page}>`
  // (32px 56px 80px padding). We want the cards much wider than the default
  // page gutter, so we cancel the parent's horizontal padding with a negative
  // horizontal margin and apply a tighter gutter ourselves.
  return (
    <div style={{ marginLeft: -56, marginRight: -56, paddingLeft: 24, paddingRight: 24 }}>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageHeaderMeta}>SETTINGS · 06</div>
          <div className={styles.pageTitle}>
            Prompts <span className={styles.pageTitleSub}>· system instructions</span>
          </div>
        </div>
      </div>
      <hr className={styles.pageHeaderDivider} />

      {/* ROSE.md */}
      <div className={styles.providerCard}>
        <button
          type="button"
          className={styles.providerCardHeader}
          onClick={() => setRoseExpanded((v) => !v)}
        >
          <div className={styles.providerCardHeaderInner}>
            <div className={styles.providerNameBlock}>
              <div className={styles.providerNameRow}>
                <span className={styles.providerName}>ROSE.md</span>
                <span className={styles.providerLatin}>Rosa fundamentum</span>
              </div>
              <div className={styles.providerStatusRow}>
                <span className={styles.providerFieldInfo}>
                  Persona, identity, and core instructions for the agent.
                </span>
              </div>
            </div>
            <span className={styles.providerCaret} style={{ transform: roseExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
          </div>
        </button>
        {roseExpanded && (
          <div className={styles.providerCardBody}>
            {roseInjected.header.trim() && (
              <InjectedSectionPanel text={roseInjected.header} theme={theme} position="header" />
            )}
            <MarkdownPromptEditor value={roseContent} onChange={setRoseContent} height={420} />
            {roseInjected.footer.trim() && (
              <InjectedSectionPanel text={roseInjected.footer} theme={theme} position="footer" />
            )}
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>
              The greyed panels are injected into the system prompt and cannot be edited here. The
              People block above comes from your settings; the sections below (workspace
              instructions, extension prompts, environment, and core rules) are appended at chat
              time. Only the middle editor — your identity — is editable.
            </p>
            <div className={styles.providerCardFooter}>
              <span className={styles.providerStorageHint}>~/.rose/ROSE.md</span>
              <div className={styles.providerFooterBtns}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={discardRose}
                  disabled={!roseDirty || roseSaving}
                >
                  DISCARD
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={saveRose}
                  disabled={!roseDirty || roseSaving}
                  style={{ color: roseDirty ? 'var(--color-accent)' : undefined }}
                >
                  {roseSaving ? 'SAVING…' : 'SAVE'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Per-extension cards */}
      {rows.map((row) => {
        const promptDisabled = disabledPrompts.includes(row.id)
        const greyed = !row.extensionEnabled
        const noPromptYet = row.source === 'none' && !row.dirty && row.content === ''

        return (
          <div
            key={row.id}
            className={styles.providerCard}
            style={{ opacity: greyed ? 0.55 : 1 }}
          >
            <div className={styles.providerCardHeader} style={{ cursor: 'default' }}>
              <div className={styles.providerCardHeaderInner}>
                <button
                  type="button"
                  onClick={() => toggleRowExpanded(row.id)}
                  className={styles.providerNameBlock}
                  style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}
                >
                  <div className={styles.providerNameRow}>
                    <span className={styles.providerName}>{row.name}</span>
                    <span className={styles.providerLatin}>{row.id}</span>
                  </div>
                  <div className={styles.providerStatusRow}>
                    <span className={styles.providerFieldInfo}>
                      {greyed ? 'extension disabled · prompt not contributed' :
                        row.source === 'user' ? 'custom override (saved)' :
                        row.source === 'default' ? 'using bundled default' :
                        'no prompt — click to add one'}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => togglePromptEnabled(row.id)}
                  role="switch"
                  aria-checked={!promptDisabled}
                  disabled={greyed}
                  className={`${styles.hToggle} ${!promptDisabled ? styles.hToggleOn : styles.hToggleOff}`}
                  title={promptDisabled ? 'Enable this prompt' : 'Disable this prompt'}
                >
                  <span className={styles.hToggleThumb} />
                </button>
                <span
                  className={styles.providerCaret}
                  style={{ transform: row.expanded ? 'rotate(90deg)' : 'none' }}
                  onClick={() => toggleRowExpanded(row.id)}
                >›</span>
              </div>
            </div>
            {row.expanded && (
              <div className={styles.providerCardBody}>
                {!row.loaded ? (
                  <div className={styles.emptyState}>Loading…</div>
                ) : noPromptYet ? (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 14px' }}>
                      This extension does not ship a default prompt. You can author a custom one — it will be saved
                      to <code>.projectrose/prompts/{row.id}.md</code> and appended to the system prompt at chat time.
                    </p>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => updateRowContent(row.id, '\n')}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      ADD PROMPT
                    </button>
                  </div>
                ) : (
                  <>
                    <MarkdownPromptEditor
                      value={row.content}
                      onChange={(next) => updateRowContent(row.id, next)}
                    />
                    <div className={styles.providerCardFooter}>
                      <span className={styles.providerStorageHint}>
                        {row.hasUserFile
                          ? `.projectrose/prompts/${row.id}.md`
                          : `bundled default · ${row.id}`}
                      </span>
                      <div className={styles.providerFooterBtns}>
                        {row.hasUserFile && (
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() => setConfirmReset({ id: row.id, name: row.name })}
                            disabled={row.saving}
                          >
                            RESET TO DEFAULT
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => discardRow(row.id)}
                          disabled={!row.dirty || row.saving}
                        >
                          DISCARD
                        </button>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => saveRow(row.id)}
                          disabled={!row.dirty || row.saving}
                          style={{ color: row.dirty ? 'var(--color-accent)' : undefined }}
                        >
                          {row.saving ? 'SAVING…' : 'SAVE'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {confirmReset && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setConfirmReset(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              padding: 24,
              minWidth: 360,
              maxWidth: 480
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 10 }}>
              Reset prompt to default?
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              Your custom prompt for <strong>{confirmReset.name}</strong> will be deleted and the bundled default
              will be restored. This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setConfirmReset(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={async () => {
                  const id = confirmReset.id
                  setConfirmReset(null)
                  await resetRow(id)
                }}
                style={{ color: 'var(--color-accent)' }}
              >
                RESET
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
