import { useCallback, useEffect, useState } from 'react'
import type {
  EmailAddress,
  EmailFolder,
  EmailMessage,
  EmailMessageSummary,
  EmailStatus
} from '@shared/email'
import { useAppsDrawerStore } from '../../../stores/useAppsDrawerStore'
import { logInteraction } from '../../../lib/interactionLog'
import styles from './InboxPage.module.css'

type GmailErrorCategory = 'scope-missing' | 'api-disabled' | 'generic'

interface GmailErrorInfo {
  category: GmailErrorCategory
  message: string
  url: string | null
}

/**
 * Parse an error message coming back from the Gmail transport. Main-side
 * `callGmail()` tags translated errors with `[email:<category>]` prefixes
 * (see gmailTransport.ts). Untagged errors are treated as `generic`. If
 * the message contains an https URL we surface it as a clickable link so
 * the user has a one-click path to whatever Google action is needed.
 */
function parseGmailError(message: string | null): GmailErrorInfo | null {
  if (!message) return null
  let category: GmailErrorCategory = 'generic'
  let text = message
  const tagMatch = message.match(/^\[email:(scope-missing|api-disabled)\]\s*(.*)$/s)
  if (tagMatch) {
    category = tagMatch[1] as GmailErrorCategory
    text = tagMatch[2]
  }
  const urlMatch = text.match(/https?:\/\/[^\s)]+/)
  return { category, message: text, url: urlMatch?.[0] ?? null }
}

export function InboxPage(): JSX.Element {
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [folders, setFolders] = useState<EmailFolder[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [messages, setMessages] = useState<EmailMessageSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reader, setReader] = useState<EmailMessage | null>(null)
  const [readerErr, setReaderErr] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatus(await window.api.email.getStatus())
  }, [])

  const [folderErr, setFolderErr] = useState<string | null>(null)

  const loadFolders = useCallback(async () => {
    setFolderErr(null)
    try {
      const list = await window.api.email.listFolders()
      // Pin INBOX to the top regardless of the transport's native order
      // (Gmail returns labels in a server-defined order; IMAP varies by
      // server).
      const sorted = [...list].sort((a, b) => {
        const aIsInbox = a.id === 'INBOX' || a.name.toLowerCase() === 'inbox'
        const bIsInbox = b.id === 'INBOX' || b.name.toLowerCase() === 'inbox'
        if (aIsInbox && !bIsInbox) return -1
        if (bIsInbox && !aIsInbox) return 1
        return 0
      })
      setFolders(sorted)
      if (sorted.length && !activeFolder) {
        setActiveFolder(sorted[0].id)
      }
    } catch (e) {
      setFolders([])
      setFolderErr(e instanceof Error ? e.message : String(e))
    }
  }, [activeFolder])

  const loadMessages = useCallback(async () => {
    if (!activeFolder) return
    setBusy('Loading…')
    try {
      const list = await window.api.email.listMessages({ folder: activeFolder, limit: 50 })
      setMessages(list)
      if (list.length && !selectedId) setSelectedId(list[0].id)
    } catch (e) {
      setMessages([])
      setReaderErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [activeFolder, selectedId])

  useEffect(() => { void refreshStatus() }, [refreshStatus])

  useEffect(() => {
    if (status?.ready) {
      void loadFolders()
    }
  }, [status?.ready, loadFolders])

  useEffect(() => {
    if (status?.ready && activeFolder) void loadMessages()
  }, [status?.ready, activeFolder, loadMessages])

  useEffect(() => {
    if (!selectedId) { setReader(null); return }
    let cancelled = false
    setReader(null)
    setReaderErr(null)
    logInteraction('email.opened')
    window.api.email.getMessage(selectedId).then((m) => {
      if (!cancelled) setReader(m)
    }).catch((e) => {
      if (!cancelled) setReaderErr(e instanceof Error ? e.message : String(e))
    })
    return () => { cancelled = true }
  }, [selectedId])

  if (!status) return <div className={styles.page}><div className={styles.readerPlaceholder}>Loading…</div></div>

  if (!status.transport) return <EmptyState message="No transport configured." />
  if (!status.ready) {
    return <EmptyState
      message={status.transport === 'google'
        ? 'Sign in to Google to use Gmail. Open Settings.'
        : 'IMAP credentials are missing. Open Settings.'}
    />
  }

  // Surface Gmail-side errors as a top-level prompt so the user always sees
  // a clear "here's what to do" page instead of an empty 3-pane view with
  // the failure buried in the terminal.
  const gmailErr = parseGmailError(folderErr ?? readerErr)
  if (status.transport === 'google' && gmailErr) {
    return <GmailErrorPrompt info={gmailErr} onRetry={() => { void loadFolders() }} />
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        {busy && <span className={styles.busyText}>{busy}</span>}
        <button
          className={styles.composeBtn}
          onClick={() => setComposeOpen(true)}
          disabled={!status.ready}
        >
          Compose
        </button>
      </div>

      <div className={styles.threePane}>
        <FolderSidebar
          folders={folders}
          active={activeFolder}
          onSelect={(id) => { setActiveFolder(id); setSelectedId(null) }}
        />
        <MessageList
          messages={messages}
          selected={selectedId}
          onSelect={setSelectedId}
        />
        <ReaderPane
          message={reader}
          err={readerErr}
          onRefreshList={() => { void loadMessages() }}
        />
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); void loadMessages() }}
        />
      )}
    </div>
  )
}

function EmptyState(props: { message: string }): JSX.Element {
  const setMode = useAppsDrawerStore((s) => s.setMode)
  return (
    <div className={styles.page}>
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>{props.message}</div>
        <button className={styles.emptyCta} onClick={() => setMode('settings')}>
          Open Settings
        </button>
      </div>
    </div>
  )
}

/**
 * Page-level error view for Gmail failures. Branches on the error category
 * the main-process transport tagged the message with:
 *
 *   - scope-missing → user signed in before Gmail was in scope; one-click
 *     Re-authorize button signs out and signs in again, forcing fresh
 *     consent.
 *   - api-disabled → user's Google Cloud project does not have the Gmail
 *     API enabled; we surface the enable URL Google gave us so the user
 *     can open the console, click Enable, then click Retry here.
 *   - generic → unknown failure; show the message verbatim with any URL
 *     made clickable so the user can self-diagnose.
 */
function GmailErrorPrompt(props: { info: GmailErrorInfo; onRetry: () => void }): JSX.Element {
  const setMode = useAppsDrawerStore((s) => s.setMode)
  const [busy, setBusy] = useState<string | null>(null)
  const { info } = props

  const reauthorize = async (): Promise<void> => {
    setBusy('Re-authorizing…')
    try {
      await window.api.contacts.googleSignOut()
      await window.api.contacts.googleSignIn()
      window.location.reload()
    } finally { setBusy(null) }
  }

  const openUrl = (url: string): void => {
    // Renderer-side window.open is intercepted by main's
    // webContents.setWindowOpenHandler, which routes it to
    // shell.openExternal — so the URL opens in the user's default browser.
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const title =
    info.category === 'scope-missing' ? 'Google sign-in does not include Gmail.' :
    info.category === 'api-disabled' ? 'Gmail API is not enabled.' :
    'Gmail call failed.'

  const hint =
    info.category === 'scope-missing'
      ? 'Your existing sign-in was issued before Gmail support was added. Re-authorize to grant the Gmail scope — the consent screen will show you what you’re approving.'
      : info.category === 'api-disabled'
        ? 'Your Google Cloud project does not have the Gmail API enabled. Open the link below, click Enable, wait a minute for the change to propagate, then click Retry.'
        : null

  return (
    <div className={styles.page}>
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>{title}</div>
        <div className={styles.readerMeta}>{info.message}</div>
        {hint && <div className={styles.hint}>{hint}</div>}
        {info.url && (
          <div className={styles.hint}>
            <a
              href={info.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.preventDefault(); openUrl(info.url!) }}
              style={{ color: 'var(--color-accent, #e05c84)' }}
            >
              {info.url}
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {info.category === 'scope-missing' && (
            <button className={styles.emptyCta} onClick={() => void reauthorize()} disabled={busy !== null}>
              {busy ?? 'Re-authorize Google'}
            </button>
          )}
          {info.category === 'api-disabled' && info.url && (
            <button className={styles.emptyCta} onClick={() => openUrl(info.url!)} disabled={busy !== null}>
              Enable Gmail API
            </button>
          )}
          <button className={styles.btn} onClick={props.onRetry} disabled={busy !== null}>
            Retry
          </button>
          <button className={styles.btn} onClick={() => setMode('settings')} disabled={busy !== null}>
            Open Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Folder sidebar ───────────────────────────────────────────────────────

function FolderSidebar(props: {
  folders: EmailFolder[]
  active: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <div className={styles.sidebar}>
      {props.folders.map((f) => (
        <button
          key={f.id}
          className={props.active === f.id ? styles.sidebarItemActive : styles.sidebarItem}
          onClick={() => props.onSelect(f.id)}
        >
          {f.name}
        </button>
      ))}
      {props.folders.length === 0 && (
        <div className={styles.sidebarEmpty}>No folders.</div>
      )}
    </div>
  )
}

// ── Message list ─────────────────────────────────────────────────────────

function MessageList(props: {
  messages: EmailMessageSummary[]
  selected: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <div className={styles.messageList}>
      {props.messages.map((m) => {
        const baseClass = props.selected === m.id ? styles.messageRowActive : styles.messageRow
        return (
          <div
            key={m.id}
            className={m.read ? baseClass : `${baseClass} ${styles.messageRowUnread}`}
            onClick={() => props.onSelect(m.id)}
          >
            <div className={styles.messageFrom}>{m.from?.address ?? '(unknown)'}</div>
            <div className={styles.messageDate}>{new Date(m.date).toLocaleString()}</div>
            <div className={styles.messageSubject}>{m.subject || '(no subject)'}</div>
            <div className={styles.messageSnippet}>{m.snippet}</div>
          </div>
        )
      })}
      {props.messages.length === 0 && (
        <div className={styles.messageListEmpty}>No messages.</div>
      )}
    </div>
  )
}

// ── Reader pane ──────────────────────────────────────────────────────────

function ReaderPane(props: {
  message: EmailMessage | null
  err: string | null
  onRefreshList: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)

  if (props.err) {
    return (
      <div className={styles.reader}>
        <div className={styles.readerHeader}>
          <div className={styles.readerError}>{props.err}</div>
        </div>
      </div>
    )
  }

  if (!props.message) {
    return (
      <div className={styles.reader}>
        <div className={styles.readerPlaceholder}>Select a message to read.</div>
      </div>
    )
  }

  const m = props.message

  const archive = async (): Promise<void> => {
    setBusy(true)
    try { await window.api.email.archive(m.id); logInteraction('email.archived'); props.onRefreshList() } finally { setBusy(false) }
  }
  const del = async (): Promise<void> => {
    setBusy(true)
    try { await window.api.email.deleteMessage(m.id); logInteraction('email.deleted'); props.onRefreshList() } finally { setBusy(false) }
  }
  const markUnread = async (): Promise<void> => {
    setBusy(true)
    try { await window.api.email.markRead({ messageId: m.id, read: false }); logInteraction('email.marked-unread'); props.onRefreshList() } finally { setBusy(false) }
  }

  return (
    <div className={styles.reader}>
      <div className={styles.readerHeader}>
        <h2 className={styles.readerSubject}>{m.subject || '(no subject)'}</h2>
        <div className={styles.readerMeta}>
          From: {m.from?.address ?? '(unknown)'}{m.from?.name ? ` "${m.from.name}"` : ''}
          {' · '}{new Date(m.date).toLocaleString()}
        </div>
        <div className={styles.readerMeta}>
          To: {m.to.map((a) => a.address).join(', ') || '(none)'}
        </div>
        <div className={styles.readerActions}>
          <button onClick={() => setReplyOpen(true)} disabled={busy}>Reply</button>
          <button onClick={() => setForwardOpen(true)} disabled={busy}>Forward</button>
          <button onClick={() => void archive()} disabled={busy}>Archive</button>
          <button onClick={() => void markUnread()} disabled={busy}>Mark Unread</button>
          <button onClick={() => void del()} disabled={busy}>Delete</button>
        </div>
      </div>
      <div className={styles.readerBody}>{m.body}</div>
      {replyOpen && (
        <ComposeModal
          presetTo={m.from ? [m.from] : []}
          presetSubject={m.subject.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject}`}
          replyToId={m.id}
          onClose={() => setReplyOpen(false)}
          onSent={() => { setReplyOpen(false); props.onRefreshList() }}
        />
      )}
      {forwardOpen && (
        <ComposeModal
          presetSubject={m.subject.toLowerCase().startsWith('fwd:') ? m.subject : `Fwd: ${m.subject}`}
          presetBody={`\n\n--- Forwarded message ---\nFrom: ${m.from?.address ?? ''}\nSubject: ${m.subject}\nDate: ${new Date(m.date).toISOString()}\n\n${m.body}`}
          forwardFromId={m.id}
          onClose={() => setForwardOpen(false)}
          onSent={() => { setForwardOpen(false); props.onRefreshList() }}
        />
      )}
    </div>
  )
}

// ── Compose modal ────────────────────────────────────────────────────────

function ComposeModal(props: {
  onClose: () => void
  onSent: () => void
  presetTo?: EmailAddress[]
  presetSubject?: string
  presetBody?: string
  replyToId?: string
  forwardFromId?: string
}): JSX.Element {
  const [to, setTo] = useState((props.presetTo ?? []).map((a) => a.address).join(', '))
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState(props.presetSubject ?? '')
  const [body, setBody] = useState(props.presetBody ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const parseAddrs = (raw: string): EmailAddress[] =>
    raw.split(',').map((s) => s.trim()).filter(Boolean).map((address) => ({ address }))

  const send = async (): Promise<void> => {
    setErr(null)
    const toList = parseAddrs(to)
    if (toList.length === 0) { setErr('At least one recipient required.'); return }
    setBusy(true)
    try {
      if (props.replyToId) {
        await window.api.email.reply({ messageId: props.replyToId, body, replyAll: false })
        logInteraction('email.replied')
      } else if (props.forwardFromId) {
        await window.api.email.forward({ messageId: props.forwardFromId, to: toList, body })
        logInteraction('email.forwarded')
      } else {
        await window.api.email.sendMessage({
          to: toList,
          cc: cc ? parseAddrs(cc) : undefined,
          bcc: bcc ? parseAddrs(bcc) : undefined,
          subject,
          body
        })
        logInteraction('email.sent')
      }
      props.onSent()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.modalScrim}>
      <div className={styles.modal}>
        <div className={styles.cardTitle}>{props.replyToId ? 'Reply' : props.forwardFromId ? 'Forward' : 'New message'}</div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>To</label>
          <input className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="comma,separated@addresses.com" />
        </div>
        {!props.replyToId && !props.forwardFromId && (
          <>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Cc</label>
              <input className={styles.input} value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Bcc</label>
              <input className={styles.input} value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </>
        )}
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Subject</label>
          <input
            className={styles.input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!!props.replyToId}
          />
        </div>
        <textarea
          className={styles.modalTextarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
        />
        {err && <div className={styles.error}>{err}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={props.onClose} disabled={busy}>Cancel</button>
          <button className={styles.btnPrimary} onClick={() => void send()} disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

