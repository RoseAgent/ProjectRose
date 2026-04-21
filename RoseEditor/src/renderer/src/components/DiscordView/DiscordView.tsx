import { useEffect, useRef, useCallback } from 'react'
import { useDiscordStore } from '../../stores/useDiscordStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useViewStore } from '../../stores/useViewStore'
import type { DiscordMessage, DiscordEmbed } from '../../types/electron'
import styles from './DiscordView.module.css'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function EmbedCard({ embed }: { embed: DiscordEmbed }): JSX.Element {
  return (
    <div className={styles.embed}>
      {embed.title && (
        embed.url
          ? <a className={styles.embedTitle} href={embed.url} target="_blank" rel="noreferrer">{embed.title}</a>
          : <span className={styles.embedTitle}>{embed.title}</span>
      )}
      {embed.description && <div className={styles.embedDesc}>{embed.description}</div>}
      {embed.fields?.map((f, i) => (
        <div key={i} className={styles.embedField}>
          <div className={styles.embedFieldName}>{f.name}</div>
          <div className={styles.embedFieldValue}>{f.value}</div>
        </div>
      ))}
      {embed.image && <img className={styles.embedImage} src={embed.image.url} alt="" />}
    </div>
  )
}

function MessageItem({ msg }: { msg: DiscordMessage }): JSX.Element {
  const fallbackAvatar = `https://cdn.discordapp.com/embed/avatars/0.png`
  return (
    <div className={styles.message}>
      <img
        className={styles.avatar}
        src={msg.avatarUrl ?? fallbackAvatar}
        alt=""
        onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar }}
      />
      <div className={styles.messageBody}>
        <div className={styles.messageHeader}>
          <span className={styles.displayName}>{msg.authorDisplayName}</span>
          {msg.authorUsername !== msg.authorDisplayName && (
            <span className={styles.username}>@{msg.authorUsername}</span>
          )}
          <span className={styles.timestamp}>{formatTimestamp(msg.timestamp)}</span>
        </div>
        {msg.content && <div className={styles.content}>{msg.content}</div>}
        {msg.embeds.map((e, i) => <EmbedCard key={i} embed={e} />)}
        {msg.attachments.length > 0 && (
          <div className={styles.attachments}>
            {msg.attachments.map(a => (
              <a key={a.id} className={styles.attachment} href={a.url} target="_blank" rel="noreferrer">
                {a.filename}
              </a>
            ))}
          </div>
        )}
        {msg.reactions.length > 0 && (
          <div className={styles.reactions}>
            {msg.reactions.map((r, i) => (
              <span key={i} className={styles.reaction}>{r.emoji} {r.count}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function DiscordView(): JSX.Element {
  const discordBotToken = useSettingsStore((s) => s.discordBotToken)
  const discordChannels = useSettingsStore((s) => s.discordChannels)
  const setActiveView = useViewStore((s) => s.setActiveView)

  const {
    connected, channels, enabledChannelIds, activeChannelId,
    messages, hasMoreMessages, loadingMessages,
    input,
    connect, disconnect, selectChannel,
    fetchOlderMessages, sendMessage, setInput
  } = useDiscordStore()

  const messageListRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const activeMessages = activeChannelId ? (messages[activeChannelId] ?? []) : []

  useEffect(() => {
    if (isNearBottomRef.current && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [activeMessages.length])

  const handleScroll = useCallback(() => {
    const el = messageListRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  const enabledChannels = channels.filter((c) => enabledChannelIds.includes(c.id))
  const guilds = Array.from(new Map(enabledChannels.map((c) => [c.guildId, c.guildName])).entries())

  if (!discordBotToken) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <span>Configure a Discord bot token in Settings to get started.</span>
          <button className={styles.emptyBtn} onClick={() => setActiveView('settings')}>
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <div className={styles.connectionBar}>
          <span className={`${styles.statusDot} ${connected ? styles.statusDotOnline : styles.statusDotOffline}`} />
          <span className={styles.statusLabel}>{connected ? 'Connected' : 'Disconnected'}</span>
          <button className={styles.connectBtn} onClick={connected ? disconnect : connect}>
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {enabledChannels.length === 0 && (
          <div className={styles.placeholder}>No channels enabled. Add some in Settings &gt; Discord.</div>
        )}

        {guilds.map(([guildId, guildName]) => (
          <div key={guildId} className={styles.guildSection}>
            <div className={styles.guildHeader}>{guildName}</div>
            {enabledChannels.filter((c) => c.guildId === guildId).map((ch) => (
              <div key={ch.id} className={styles.channelRow}>
                <button
                  className={`${styles.channelBtn} ${activeChannelId === ch.id ? styles.channelBtnActive : ''}`}
                  onClick={() => selectChannel(ch.id)}
                >
                  # {ch.name}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.chatPane}>
        <div className={styles.channelHeader}>
          {activeChannel ? `# ${activeChannel.name}` : 'Select a channel'}
        </div>

        <div className={styles.messageList} ref={messageListRef} onScroll={handleScroll}>
          {activeChannelId && hasMoreMessages[activeChannelId] && (
            <button
              className={styles.loadMoreBtn}
              onClick={() => fetchOlderMessages(activeChannelId)}
              disabled={loadingMessages}
            >
              {loadingMessages ? 'Loading…' : 'Load older messages'}
            </button>
          )}
          {!activeChannelId && (
            <div className={styles.placeholder}>Select a channel to view messages</div>
          )}
          {activeMessages.map((msg) => (
            <MessageItem key={msg.id} msg={msg} />
          ))}
        </div>

        <div className={styles.inputBar}>
          <textarea
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Select a channel first'}
            disabled={!connected || !activeChannelId}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={() => sendMessage()}
            disabled={!connected || !activeChannelId || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
