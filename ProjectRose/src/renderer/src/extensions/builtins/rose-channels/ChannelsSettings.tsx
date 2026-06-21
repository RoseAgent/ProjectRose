// rose-channels — SettingsView (per-workspace).
//
// Settings is where the user pastes Discord and Slack bot tokens. The tokens
// are encrypted at rest via Electron's safeStorage (see credentialsStore.ts);
// only the per-source "connected" status and bot identity surface here.

import { useCallback, useEffect, useState } from 'react'
import { useProjectStore } from '../../../stores/useProjectStore'
import styles from './ChannelsPage.module.css'

type ConnectionStatus = { connected: boolean; identity: string | null }

export function ChannelsSettings(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath) ?? ''
  const [status, setStatus] = useState<{ discord: ConnectionStatus; slack: ConnectionStatus }>({
    discord: { connected: false, identity: null },
    slack: { connected: false, identity: null }
  })
  const [discordToken, setDiscordToken] = useState('')
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackAppToken, setSlackAppToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!rootPath) return
    try {
      const s = await window.api.channels.status(rootPath)
      setStatus(s)
    } catch {
      /* tolerate */
    }
  }, [rootPath])

  useEffect(() => {
    void refreshStatus()
    const off = window.api.on('channels:changed', () => {
      void refreshStatus()
    })
    return () => {
      off()
    }
  }, [refreshStatus])

  if (!rootPath) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Open a workspace to configure Channels.</div>
      </div>
    )
  }

  const handleSaveDiscord = async (): Promise<void> => {
    if (!discordToken.trim()) return
    setBusy(true)
    setErrorBanner(null)
    try {
      const result = await window.api.channels.setDiscordToken(rootPath, discordToken.trim())
      if (!result.ok) setErrorBanner(result.error ?? 'Failed to save Discord token.')
      else setDiscordToken('')
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const handleClearDiscord = async (): Promise<void> => {
    if (!window.confirm('Disconnect Discord and remove the saved bot token?')) return
    setBusy(true)
    try {
      await window.api.channels.clearDiscord(rootPath)
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const handleSaveSlack = async (): Promise<void> => {
    if (!slackBotToken.trim() || !slackAppToken.trim()) return
    setBusy(true)
    setErrorBanner(null)
    try {
      const result = await window.api.channels.setSlackTokens(rootPath, {
        botToken: slackBotToken.trim(),
        appToken: slackAppToken.trim()
      })
      if (!result.ok) setErrorBanner(result.error ?? 'Failed to save Slack tokens.')
      else {
        setSlackBotToken('')
        setSlackAppToken('')
      }
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  const handleClearSlack = async (): Promise<void> => {
    if (!window.confirm('Disconnect Slack and remove the saved bot + app tokens?')) return
    setBusy(true)
    try {
      await window.api.channels.clearSlack(rootPath)
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.title}>Channels — Settings</div>
      </div>

      {errorBanner && (
        <div className={`${styles.connectionBanner} ${styles.connectionBannerWarn}`}>
          {errorBanner}
        </div>
      )}

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Discord</div>
        <div className={styles.connectionBanner}>
          {status.discord.connected
            ? `Connected as ${status.discord.identity ?? '(unknown)'}.`
            : 'Not connected.'}
        </div>
        <div className={styles.fieldLabel}>Bot token</div>
        <input
          className={styles.input}
          type="password"
          value={discordToken}
          onChange={(e) => setDiscordToken(e.target.value)}
          placeholder="MTI...your bot token..."
          autoComplete="off"
        />
        <div className={`${styles.row} ${styles.rowEnd}`}>
          {status.discord.connected && (
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleClearDiscord} disabled={busy}>
              Disconnect
            </button>
          )}
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSaveDiscord}
            disabled={busy || !discordToken.trim()}
          >
            {status.discord.connected ? 'Replace token' : 'Connect'}
          </button>
        </div>
        <div className={styles.ruleRowMeta}>
          Create a bot at discord.com/developers/applications. Enable the Message Content intent,
          then invite the bot to your server with read + send permissions.
        </div>
      </div>

      <div className={styles.field} style={{ marginTop: 16 }}>
        <div className={styles.fieldLabel}>Slack</div>
        <div className={styles.connectionBanner}>
          {status.slack.connected
            ? `Connected as ${status.slack.identity ?? '(unknown)'}.`
            : 'Not connected.'}
        </div>
        <div className={styles.fieldLabel}>Bot token (xoxb-…)</div>
        <input
          className={styles.input}
          type="password"
          value={slackBotToken}
          onChange={(e) => setSlackBotToken(e.target.value)}
          placeholder="xoxb-..."
          autoComplete="off"
        />
        <div className={styles.fieldLabel}>App-level token (xapp-…)</div>
        <input
          className={styles.input}
          type="password"
          value={slackAppToken}
          onChange={(e) => setSlackAppToken(e.target.value)}
          placeholder="xapp-..."
          autoComplete="off"
        />
        <div className={`${styles.row} ${styles.rowEnd}`}>
          {status.slack.connected && (
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleClearSlack} disabled={busy}>
              Disconnect
            </button>
          )}
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSaveSlack}
            disabled={busy || !slackBotToken.trim() || !slackAppToken.trim()}
          >
            {status.slack.connected ? 'Replace tokens' : 'Connect'}
          </button>
        </div>
        <div className={styles.ruleRowMeta}>
          Create an app at api.slack.com/apps, enable Socket Mode, install the bot to your workspace,
          and copy both the bot token (xoxb-…) and app-level token (xapp-…, with connections:write).
        </div>
      </div>

      <div className={styles.field} style={{ marginTop: 16 }}>
        <div className={styles.fieldLabel}>Email</div>
        <div className={styles.connectionBanner}>
          Channel Rules for email use the account configured in the Email extension.
          No additional setup needed here.
        </div>
      </div>
    </div>
  )
}
