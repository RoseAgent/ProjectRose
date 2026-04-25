import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '@renderer/stores/useSettingsStore'

interface DiscordChannel {
  id: string
  name: string
  guildId: string
  guildName: string
}

const s: Record<string, React.CSSProperties> = {
  section: { marginBottom: 24 },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)', marginBottom: 12 },
  card: { display: 'flex', flexDirection: 'column' as const, gap: 8, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 6px)', background: 'var(--color-bg-secondary)' },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginTop: 4 },
  desc: { fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 },
  input: { width: '100%', padding: '6px 10px', background: 'var(--color-input-bg, var(--color-bg))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm, 4px)', color: 'var(--color-text-primary)', fontSize: 13, boxSizing: 'border-box' as const },
  btn: { padding: '6px 14px', background: 'var(--color-button-bg, var(--color-bg-secondary))', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm, 4px)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' },
  checkbox: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px 0' },
  statusDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 4 },
}

export function DiscordSettings(): JSX.Element {
  const { discordBotToken, discordChannels, update } = useSettingsStore()
  const [channelList, setChannelList] = useState<DiscordChannel[]>([])
  const [connected, setConnected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const refreshChannels = useCallback(async () => {
    if (!discordBotToken) return
    setRefreshing(true)
    try {
      const result = await window.api.invoke('rose-discord:connect') as { ok: boolean; channels?: DiscordChannel[] }
      if (result.ok && result.channels) {
        setChannelList(result.channels)
        setConnected(true)
      }
    } catch { /* extension not loaded */ } finally {
      setRefreshing(false)
    }
  }, [discordBotToken])

  useEffect(() => {
    if (discordBotToken) refreshChannels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleChannel(id: string): void {
    const current = discordChannels ?? []
    const updated = current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    update({ discordChannels: updated })
  }

  const guilds = Array.from(new Map(channelList.map((c) => [c.guildId, c.guildName])).entries())
  const enabledSet = new Set(discordChannels ?? [])

  return (
    <div>
      <div style={s.section}>
        <div style={s.title}>Discord Bot</div>
        <div style={s.card}>
          <div style={s.label}>Bot Token</div>
          <div style={{ ...s.desc, marginBottom: 4 }}>
            Create a bot at discord.com/developers, enable the Guilds, GuildMessages, and MessageContent
            (privileged) intents, invite the bot to your servers, then paste the token below.
          </div>
          <input style={s.input} type="password" placeholder="Bot token…"
            value={discordBotToken} onChange={(e) => update({ discordBotToken: e.target.value })} />
          <div style={{ ...s.desc, marginTop: 4 }}>
            <span style={{ ...s.statusDot, background: connected ? 'var(--color-success, #3a3)' : 'var(--color-text-muted)' }} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {discordBotToken && (
        <div style={s.section}>
          <div style={{ ...s.title, display: 'flex', alignItems: 'center', gap: 10 }}>
            Visible Channels
            <button style={{ ...s.btn, fontSize: 11 }} onClick={refreshChannels} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div style={{ ...s.desc, marginBottom: 12 }}>
            Checked channels appear in the Discord view and are accessible to the AI agent tools.
          </div>
          {channelList.length === 0 && (
            <div style={{ ...s.desc, fontStyle: 'italic' }}>No channels found. Click Refresh to connect the bot.</div>
          )}
          {guilds.map(([guildId, guildName]) => (
            <div key={guildId} style={s.card}>
              <div style={s.label}>{guildName}</div>
              {channelList.filter((c) => c.guildId === guildId).map((ch) => (
                <label key={ch.id} style={s.checkbox}>
                  <input type="checkbox" checked={enabledSet.has(ch.id)} onChange={() => toggleChannel(ch.id)} />
                  # {ch.name}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
