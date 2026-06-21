// rose-channels — PageView.
//
// Three nested views, mirroring rose-routines' RoutinesPage:
//   1. List of Channel Rules grouped by source (Discord / Slack / Email)
//   2. Click a rule → editor (source + identifier picker + prompt + tool
//      allowlist) AND a runs list below
//   3. Click a run → transcript view via the shared DetachedRunTranscriptView

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildChannelRuleMarkdown,
  emptyChannelRule,
  getChannelRulePrompt,
  isEmailFallbackRule
} from '@shared/channelRuleFields'
import {
  FALLBACK_EMAIL_IDENTIFIER,
  type ChannelRule,
  type ChannelRuleRunRecord,
  type ChannelSource
} from '@shared/channelRule'
import { parseChannelRuleRunMarkdown } from '@shared/channelRuleRun'
import type { ToolMeta } from '@shared/types'
import { useProjectStore } from '../../../stores/useProjectStore'
import { logInteraction } from '../../../lib/interactionLog'
import { DetachedRunTranscriptView } from '../../../components/DetachedRunTranscriptView'
import styles from './ChannelsPage.module.css'

type View =
  | { kind: 'list' }
  | { kind: 'edit'; slug: string | null }
  | { kind: 'run'; slug: string; filename: string }

type ConnectionStatus = { connected: boolean; identity: string | null }

interface RunListEntry {
  filename: string
  arrivedAt: string
  status: 'success' | 'failed'
  trigger: 'message' | 'manual'
  durationMs: number
}

interface RemoteChannelInfo {
  id: string
  displayLabel: string
}

const SOURCE_LABEL: Record<ChannelSource, string> = {
  discord: 'Discord',
  slack: 'Slack',
  email: 'Email'
}

function nowIsoLocal(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

export function ChannelsPage(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath) ?? ''
  const [rules, setRules] = useState<Array<{ slug: string; rule: ChannelRule }>>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [tools, setTools] = useState<ToolMeta[]>([])
  const [runs, setRuns] = useState<RunListEntry[]>([])
  const [runRecord, setRunRecord] = useState<ChannelRuleRunRecord | null>(null)
  const [status, setStatus] = useState<{ discord: ConnectionStatus; slack: ConnectionStatus }>({
    discord: { connected: false, identity: null },
    slack: { connected: false, identity: null }
  })
  const [discordChannels, setDiscordChannels] = useState<RemoteChannelInfo[]>([])
  const [slackChannels, setSlackChannels] = useState<RemoteChannelInfo[]>([])

  const reload = useCallback(async (): Promise<void> => {
    if (!rootPath) {
      setRules([])
      return
    }
    const list = await window.api.channels.list(rootPath)
    setRules(list)
  }, [rootPath])

  const reloadTools = useCallback(async (): Promise<void> => {
    if (!rootPath) {
      setTools([])
      return
    }
    try {
      const t = await window.api.tools.list(rootPath)
      setTools(t.filter((x) => x.name !== 'ask_user' && x.name !== 'screenshot'))
    } catch {
      setTools([])
    }
  }, [rootPath])

  const reloadStatus = useCallback(async (): Promise<void> => {
    if (!rootPath) return
    try {
      const s = await window.api.channels.status(rootPath)
      setStatus(s)
      if (s.discord.connected) {
        const ch = await window.api.channels.listDiscordChannels(rootPath)
        setDiscordChannels(ch)
      } else {
        setDiscordChannels([])
      }
      if (s.slack.connected) {
        const ch = await window.api.channels.listSlackChannels(rootPath)
        setSlackChannels(ch)
      } else {
        setSlackChannels([])
      }
    } catch {
      /* tolerate */
    }
  }, [rootPath])

  useEffect(() => {
    void reload()
    void reloadTools()
    void reloadStatus()
  }, [reload, reloadTools, reloadStatus])

  // Listen for channels:changed broadcasts from the main module.
  useEffect(() => {
    if (!rootPath) return
    const off = window.api.on('channels:changed', () => {
      void reload()
      void reloadStatus()
      if (view.kind === 'edit' && view.slug) {
        void window.api.channels.listRuns(rootPath, view.slug).then(setRuns)
      }
    })
    return () => {
      off()
    }
  }, [rootPath, reload, reloadStatus, view])

  // Load runs when entering edit view.
  useEffect(() => {
    if (view.kind !== 'edit' || !view.slug || !rootPath) {
      setRuns([])
      return
    }
    void window.api.channels.listRuns(rootPath, view.slug).then(setRuns)
  }, [view, rootPath])

  // Load transcript when opening a run.
  useEffect(() => {
    if (view.kind !== 'run' || !rootPath) {
      setRunRecord(null)
      return
    }
    void (async () => {
      const md = await window.api.channels.readRun(rootPath, view.slug, view.filename)
      setRunRecord(md ? parseChannelRuleRunMarkdown(md) : null)
    })()
  }, [view, rootPath])

  if (!rootPath) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Open a workspace to manage Channel Rules.</div>
      </div>
    )
  }

  const handleNew = (): void => setView({ kind: 'edit', slug: null })
  const handleSelect = (slug: string): void => setView({ kind: 'edit', slug })
  const handleBack = (): void => setView({ kind: 'list' })

  const activeSlug = view.kind === 'edit' ? view.slug : null
  const activeRule: ChannelRule | null = useMemo(() => {
    if (view.kind !== 'edit') return null
    if (view.slug === null) {
      const r = emptyChannelRule()
      r.createdAt = nowIsoLocal()
      r.sections['Prompt'] = ''
      return r
    }
    return rules.find((r) => r.slug === view.slug)?.rule ?? null
  }, [view, rules])

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.title}>Channels</div>
        <div>
          {view.kind === 'list' ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleNew}>
              New Rule
            </button>
          ) : (
            <button className={styles.btn} onClick={handleBack}>
              ← All Rules
            </button>
          )}
        </div>
      </div>

      {view.kind === 'list' && (
        <ListView
          rules={rules}
          status={status}
          onSelect={handleSelect}
        />
      )}

      {view.kind === 'edit' && activeRule && (
        <EditView
          rootPath={rootPath}
          slug={activeSlug}
          rule={activeRule}
          tools={tools}
          runs={runs}
          status={status}
          discordChannels={discordChannels}
          slackChannels={slackChannels}
          onSaved={async (newSlug) => {
            await reload()
            setView({ kind: 'edit', slug: newSlug })
          }}
          onDeleted={async () => {
            await reload()
            setView({ kind: 'list' })
          }}
          onOpenRun={(filename) => setView({ kind: 'run', slug: activeSlug!, filename })}
        />
      )}

      {view.kind === 'run' && (
        <RunView record={runRecord} onBack={() => setView({ kind: 'edit', slug: view.slug })} />
      )}
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────

function ListView({
  rules,
  status,
  onSelect
}: {
  rules: Array<{ slug: string; rule: ChannelRule }>
  status: { discord: ConnectionStatus; slack: ConnectionStatus }
  onSelect: (slug: string) => void
}): JSX.Element {
  const grouped: Record<ChannelSource, Array<{ slug: string; rule: ChannelRule }>> = {
    discord: [],
    slack: [],
    email: []
  }
  for (const entry of rules) grouped[entry.rule.source].push(entry)

  if (rules.length === 0) {
    return (
      <div className={styles.listColumn}>
        {!status.discord.connected && !status.slack.connected && (
          <div className={`${styles.connectionBanner} ${styles.connectionBannerWarn}`}>
            No bot tokens configured. Open Channels in Settings to connect Discord or Slack.
            Email rules work as soon as rose-email is signed in.
          </div>
        )}
        <div className={styles.empty}>
          No Channel Rules yet. Click "New Rule" to react to your first message.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.listColumn}>
      {(['discord', 'slack', 'email'] as ChannelSource[]).map((src) => {
        const entries = grouped[src]
        if (entries.length === 0) return null
        return (
          <div key={src} className={styles.sourceGroup}>
            <div className={styles.sourceGroupHeader}>{SOURCE_LABEL[src]}</div>
            {entries.map(({ slug, rule }) => (
              <div
                key={slug}
                className={`${styles.ruleRow} ${rule.enabled ? '' : styles.ruleRowDisabled}`}
                onClick={() => onSelect(slug)}
              >
                <div className={styles.ruleRowName}>
                  {rule.name || '(untitled)'} {!rule.enabled && '· paused'}
                </div>
                <div className={styles.ruleRowMeta}>
                  {isEmailFallbackRule(rule)
                    ? 'Any sender (fallback)'
                    : rule.identifierDisplay || rule.identifier}
                </div>
                {rule.lastFiredAt && (
                  <div className={styles.ruleRowMeta}>last fired {rule.lastFiredAt}</div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Edit view ─────────────────────────────────────────────────────────────

function EditView({
  rootPath,
  slug,
  rule,
  tools,
  runs,
  status,
  discordChannels,
  slackChannels,
  onSaved,
  onDeleted,
  onOpenRun
}: {
  rootPath: string
  slug: string | null
  rule: ChannelRule
  tools: ToolMeta[]
  runs: RunListEntry[]
  status: { discord: ConnectionStatus; slack: ConnectionStatus }
  discordChannels: RemoteChannelInfo[]
  slackChannels: RemoteChannelInfo[]
  onSaved: (slug: string) => void
  onDeleted: () => void
  onOpenRun: (filename: string) => void
}): JSX.Element {
  const [name, setName] = useState(rule.name)
  const [enabled, setEnabled] = useState(rule.enabled)
  const [source, setSource] = useState<ChannelSource>(rule.source)
  const [identifier, setIdentifier] = useState(rule.identifier)
  const [identifierDisplay, setIdentifierDisplay] = useState<string | null>(rule.identifierDisplay)
  const [prompt, setPrompt] = useState(getChannelRulePrompt(rule))
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set(rule.tools))
  const [emailIsFallback, setEmailIsFallback] = useState(
    rule.source === 'email' && rule.identifier === FALLBACK_EMAIL_IDENTIFIER
  )
  const [testAuthor, setTestAuthor] = useState('tester@example.com')
  const [testBody, setTestBody] = useState('hello, this is a test message')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(rule.name)
    setEnabled(rule.enabled)
    setSource(rule.source)
    setIdentifier(rule.identifier)
    setIdentifierDisplay(rule.identifierDisplay)
    setPrompt(getChannelRulePrompt(rule))
    setSelectedTools(new Set(rule.tools))
    setEmailIsFallback(rule.source === 'email' && rule.identifier === FALLBACK_EMAIL_IDENTIFIER)
  }, [rule])

  const toggleTool = (toolName: string): void => {
    setSelectedTools((prev) => {
      const next = new Set(prev)
      if (next.has(toolName)) next.delete(toolName)
      else next.add(toolName)
      return next
    })
  }

  const handleSourceChange = (next: ChannelSource): void => {
    setSource(next)
    setIdentifier('')
    setIdentifierDisplay(null)
    setEmailIsFallback(false)
  }

  const handleSelectRemoteChannel = (
    pool: RemoteChannelInfo[],
    selectedId: string
  ): void => {
    setIdentifier(selectedId)
    const found = pool.find((c) => c.id === selectedId)
    setIdentifierDisplay(found?.displayLabel ?? null)
  }

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) return
    let finalIdentifier = identifier.trim()
    let finalDisplay: string | null = identifierDisplay
    if (source === 'email' && emailIsFallback) {
      finalIdentifier = FALLBACK_EMAIL_IDENTIFIER
      finalDisplay = 'Any sender (fallback)'
    }
    if (!finalIdentifier) return
    setSaving(true)
    try {
      const next: ChannelRule = {
        ...rule,
        name: name.trim(),
        enabled,
        source,
        identifier: finalIdentifier,
        identifierDisplay: finalDisplay,
        tools: Array.from(selectedTools).sort(),
        sections: { ...rule.sections, Prompt: prompt }
      }
      void buildChannelRuleMarkdown(next) // round-trip sanity
      const wasCreating = !slug
      const { slug: newSlug } = await window.api.channels.save(rootPath, slug ?? '', next)
      logInteraction(wasCreating ? 'channel-rule.created' : 'channel-rule.edited')
      onSaved(newSlug)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!slug) {
      onDeleted()
      return
    }
    if (!window.confirm(`Delete rule "${name}"? Run history is preserved.`)) return
    await window.api.channels.delete(rootPath, slug)
    logInteraction('channel-rule.deleted')
    onDeleted()
  }

  const handleRunNow = async (): Promise<void> => {
    if (!slug) return
    await window.api.channels.runNow(rootPath, slug, { author: testAuthor, body: testBody })
  }

  const connectedHint = (): string | null => {
    if (source === 'discord' && !status.discord.connected) {
      return 'Discord bot is not connected. Paste a bot token in Settings → Channels.'
    }
    if (source === 'slack' && !status.slack.connected) {
      return 'Slack bot is not connected. Paste bot + app tokens in Settings → Channels.'
    }
    return null
  }
  const hint = connectedHint()

  return (
    <div className={styles.detailColumn}>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>Name</div>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="On-call escalation"
        />
      </div>

      <div className={styles.row}>
        <label className={styles.row}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className={styles.fieldLabel}>Enabled</span>
        </label>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Source</div>
        <select
          className={styles.select}
          value={source}
          onChange={(e) => handleSourceChange(e.target.value as ChannelSource)}
        >
          <option value="discord">Discord</option>
          <option value="slack">Slack</option>
          <option value="email">Email</option>
        </select>
      </div>

      {hint && <div className={`${styles.connectionBanner} ${styles.connectionBannerWarn}`}>{hint}</div>}

      {source === 'discord' && (
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Discord channel</div>
          {discordChannels.length === 0 ? (
            <div className={styles.empty}>
              No channels visible. Either the bot isn't connected, or it hasn't been invited
              to any servers yet.
            </div>
          ) : (
            <select
              className={styles.select}
              value={identifier}
              onChange={(e) => handleSelectRemoteChannel(discordChannels, e.target.value)}
            >
              <option value="">— pick a channel —</option>
              {discordChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayLabel}
                </option>
              ))}
            </select>
          )}
          {identifier && identifierDisplay && (
            <div className={styles.ruleRowMeta}>id: {identifier}</div>
          )}
        </div>
      )}

      {source === 'slack' && (
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Slack channel</div>
          {slackChannels.length === 0 ? (
            <div className={styles.empty}>
              No channels visible. Either the bot isn't connected, or it hasn't been added to
              any channels yet.
            </div>
          ) : (
            <select
              className={styles.select}
              value={identifier}
              onChange={(e) => handleSelectRemoteChannel(slackChannels, e.target.value)}
            >
              <option value="">— pick a channel —</option>
              {slackChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayLabel}
                </option>
              ))}
            </select>
          )}
          {identifier && identifierDisplay && (
            <div className={styles.ruleRowMeta}>id: {identifier}</div>
          )}
        </div>
      )}

      {source === 'email' && (
        <div className={styles.field}>
          <div className={styles.fieldLabel}>Sender address</div>
          <label className={styles.row}>
            <input
              type="checkbox"
              checked={emailIsFallback}
              onChange={(e) => {
                setEmailIsFallback(e.target.checked)
                if (e.target.checked) {
                  setIdentifier(FALLBACK_EMAIL_IDENTIFIER)
                  setIdentifierDisplay('Any sender (fallback)')
                } else {
                  setIdentifier('')
                  setIdentifierDisplay(null)
                }
              }}
            />
            <span className={styles.fieldLabel}>Any sender (fallback)</span>
          </label>
          {!emailIsFallback && (
            <input
              className={styles.input}
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value)
                setIdentifierDisplay(null)
              }}
              placeholder="boss@example.com"
            />
          )}
        </div>
      )}

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Prompt</div>
        <textarea
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell the Agent how to react when a message matching this rule arrives…"
        />
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          Tools this rule may use ({selectedTools.size} selected)
        </div>
        {tools.length === 0 ? (
          <div className={styles.empty}>No tools available in this workspace.</div>
        ) : (
          <div className={styles.toolList}>
            {tools.map((t) => (
              <label key={t.name} className={styles.toolListItem} title={t.description}>
                <input
                  type="checkbox"
                  checked={selectedTools.has(t.name)}
                  onChange={() => toggleTool(t.name)}
                />
                <span>{t.displayName || t.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={`${styles.row} ${styles.rowEnd}`}>
        <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDelete}>
          Delete
        </button>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {slug && (
        <div className={styles.testRunBlock}>
          <div className={styles.fieldLabel}>Test fire</div>
          <input
            className={styles.input}
            value={testAuthor}
            onChange={(e) => setTestAuthor(e.target.value)}
            placeholder="author (free text)"
          />
          <textarea
            className={styles.textarea}
            style={{ minHeight: 80 }}
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
            placeholder="test message body"
          />
          <div className={`${styles.row} ${styles.rowEnd}`}>
            <button className={styles.btn} onClick={handleRunNow}>
              Run Now
            </button>
          </div>
        </div>
      )}

      <div className={styles.runsSection}>
        <div className={styles.fieldLabel}>Runs ({runs.length})</div>
        {runs.length === 0 ? (
          <div className={styles.empty}>No runs yet.</div>
        ) : (
          runs.map((r) => (
            <div
              key={r.filename}
              className={`${styles.runRow} ${r.status === 'failed' ? styles.runRowFailed : ''} ${r.trigger === 'manual' ? styles.runRowManual : ''}`}
              onClick={() => onOpenRun(r.filename)}
            >
              <span>{r.arrivedAt}</span>
              <span>{r.trigger}</span>
              <span>{r.status}</span>
              <span>›</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Run transcript view ───────────────────────────────────────────────────

function RunView({
  record,
  onBack
}: {
  record: ChannelRuleRunRecord | null
  onBack: () => void
}): JSX.Element {
  if (!record) {
    return (
      <div className={styles.detailColumn}>
        <div className={styles.empty}>Loading run…</div>
      </div>
    )
  }
  return (
    <div className={styles.detailColumn}>
      <div className={styles.row}>
        <button className={styles.btn} onClick={onBack}>← Back to rule</button>
      </div>
      <div className={styles.transcriptHeader}>
        <span>{record.arrivedAt}</span>
        <span>{SOURCE_LABEL[record.source]}</span>
        <span>{record.identifierDisplay || record.identifier}</span>
        <span>{record.trigger}</span>
        <span>{record.status}</span>
        <span>from: {record.sourceMessage.author}</span>
      </div>
      <DetachedRunTranscriptView
        prompt={record.prompt}
        transcript={record.transcript}
        error={record.error}
      />
    </div>
  )
}
