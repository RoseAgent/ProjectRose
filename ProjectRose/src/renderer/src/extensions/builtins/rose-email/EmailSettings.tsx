import { useCallback, useEffect, useState } from 'react'
import type { EmailStatus, EmailTransportKind, SaveImapTransportArgs } from '@shared/email'
import type { GoogleSyncStatus } from '@shared/contacts'
import styles from './InboxPage.module.css'

// Drawer-cog SettingsView for rose-email. The user picks ONE transport
// (IMAP/SMTP or Google) and configures it; switching transports requires a
// confirmation that clears the inactive side's local state.

export function EmailSettings(): JSX.Element {
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [google, setGoogle] = useState<GoogleSyncStatus | null>(null)
  const [pending, setPending] = useState<EmailTransportKind | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [s, g] = await Promise.all([
      window.api.email.getStatus(),
      window.api.contacts.googleGetStatus()
    ])
    setStatus(s)
    setGoogle(g)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  if (!status) return <div className={styles.settingsScroll}>Loading…</div>

  const tryPick = (next: EmailTransportKind): void => {
    if (status.transport === next) return
    if (status.transport === null) {
      void applyPick(next)
      return
    }
    setPending(next)
  }

  const applyPick = async (next: EmailTransportKind): Promise<void> => {
    setPending(null)
    if (status.transport && status.transport !== next) {
      setBusy('Clearing previous transport…')
      try { await window.api.email.clearTransport() } finally { setBusy(null) }
    }
    if (next === 'google') {
      if (!google?.signedIn) {
        void refresh()
        return
      }
      setBusy('Activating Google transport…')
      try { await window.api.email.activateGoogle() } finally { setBusy(null) }
      void refresh()
    } else {
      void refresh()
    }
  }

  return (
    <div className={styles.settingsScroll}>
      <SwitchConfirmModal
        pending={pending}
        currentTransport={status.transport}
        onConfirm={() => pending && void applyPick(pending)}
        onCancel={() => setPending(null)}
      />

      <div className={styles.card}>
        <div className={styles.cardTitle}>Transport</div>
        <div className={styles.segmented} role="tablist">
          <button
            className={status.transport === 'imap' ? styles.segmentBtnActive : styles.segmentBtn}
            onClick={() => tryPick('imap')}
            disabled={busy !== null}
          >
            IMAP / SMTP
          </button>
          <button
            className={status.transport === 'google' ? styles.segmentBtnActive : styles.segmentBtn}
            onClick={() => tryPick('google')}
            disabled={busy !== null}
          >
            Google
          </button>
        </div>
        <div className={styles.cardSub}>
          One account at a time. Switching transports wipes the inactive side's local state.
        </div>
        {status.account.address && (
          <div className={styles.cardSub}>
            Signed in as <strong>{status.account.address}</strong>
          </div>
        )}
        {busy && <div className={styles.cardSub}>{busy}</div>}
      </div>

      {(status.transport === 'imap' || status.transport === null) && (
        <ImapForm onSaved={() => void refresh()} preset={status} />
      )}

      {(status.transport === 'google' || status.transport === null) && (
        <GoogleCard
          status={google}
          activeTransport={status.transport}
          onActivated={() => void refresh()}
          onSignedIn={() => void refresh()}
        />
      )}

    </div>
  )
}

// ── Switch-transport confirm modal ──────────────────────────────────────

function SwitchConfirmModal(props: {
  pending: EmailTransportKind | null
  currentTransport: EmailTransportKind | null
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element | null {
  if (!props.pending) return null
  const fromLabel = props.currentTransport === 'imap' ? 'IMAP/SMTP' : 'Google'
  const toLabel = props.pending === 'imap' ? 'IMAP/SMTP' : 'Google'
  return (
    <div className={styles.modalScrim}>
      <div className={styles.modal}>
        <div className={styles.cardTitle}>Switch transport?</div>
        <div className={styles.cardSub}>
          Switching from {fromLabel} to {toLabel} will clear the {fromLabel} credentials. Mail on the server is untouched.
        </div>
        <div className={styles.modalActions}>
          <button className={styles.btn} onClick={props.onCancel}>Cancel</button>
          <button className={styles.btnDanger} onClick={props.onConfirm}>Switch</button>
        </div>
      </div>
    </div>
  )
}

// ── IMAP/SMTP form ──────────────────────────────────────────────────────

function ImapForm(props: { onSaved: () => void; preset: EmailStatus }): JSX.Element {
  const presetImap = props.preset.transport === 'imap' ? props.preset : null
  const [address, setAddress] = useState(presetImap?.account.address ?? '')
  const [displayName, setDisplayName] = useState(presetImap?.account.displayName ?? '')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapUser, setImapUser] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setErr(null)
    if (!address || !imapHost || !imapUser || !imapPass || !smtpHost || !smtpUser || !smtpPass) {
      setErr('All fields are required.')
      return
    }
    const payload: SaveImapTransportArgs = {
      account: { address, displayName: displayName || null },
      imap: { host: imapHost, port: imapPort, secure: true, username: imapUser },
      imapPassword: imapPass,
      smtp: { host: smtpHost, port: smtpPort, secure: true, username: smtpUser },
      smtpPassword: smtpPass
    }
    setBusy(true)
    try {
      await window.api.email.saveImap(payload)
      props.onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>IMAP / SMTP credentials</div>
      <Field label="Email address" value={address} onChange={setAddress} placeholder="you@example.com" />
      <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="(optional)" />
      <div className={styles.subHead}>IMAP (incoming)</div>
      <Field label="Host" value={imapHost} onChange={setImapHost} placeholder="imap.example.com" />
      <Field label="Port" value={String(imapPort)} onChange={(v) => setImapPort(Number(v) || 993)} />
      <Field label="Username" value={imapUser} onChange={setImapUser} />
      <Field label="Password" value={imapPass} onChange={setImapPass} type="password" />
      <div className={styles.subHead}>SMTP (outgoing)</div>
      <Field label="Host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.example.com" />
      <Field label="Port" value={String(smtpPort)} onChange={(v) => setSmtpPort(Number(v) || 465)} />
      <Field label="Username" value={smtpUser} onChange={setSmtpUser} />
      <Field label="Password" value={smtpPass} onChange={setSmtpPass} type="password" />
      {err && <div className={styles.error}>{err}</div>}
      <div>
        <button className={styles.btnPrimary} onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save IMAP transport'}
        </button>
      </div>
      <div className={styles.hint}>
        Passwords are encrypted with Electron safeStorage and stored at userData/email-imap.bin.
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password'
}): JSX.Element {
  return (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>{props.label}</label>
      <input
        className={styles.input}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </div>
  )
}

// ── Google sign-in / activate card ──────────────────────────────────────

type GmailErrorCategory = 'scope-missing' | 'api-disabled' | 'generic'

interface GmailErrorInfo {
  category: GmailErrorCategory
  message: string
  url: string | null
}

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

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function GoogleCard(props: {
  status: GoogleSyncStatus | null
  activeTransport: EmailTransportKind | null
  onActivated: () => void
  onSignedIn: () => void
}): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const signIn = async (): Promise<void> => {
    setErr(null); setBusy('Signing in…')
    try {
      await window.api.contacts.googleSignIn()
      props.onSignedIn()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(null) }
  }

  const activate = async (): Promise<void> => {
    setErr(null); setBusy('Activating…')
    try {
      await window.api.email.activateGoogle()
      props.onActivated()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(null) }
  }

  /**
   * Re-authorize wipes the current refresh token and runs sign-in again. The
   * sign-in flow forces `prompt: 'consent'`, so Google issues a new token
   * covering the current GOOGLE_SCOPES — recovering users whose original
   * token predates the Gmail scope being added.
   */
  const reauthorize = async (): Promise<void> => {
    setErr(null); setBusy('Re-authorizing…')
    try {
      await window.api.contacts.googleSignOut()
      await window.api.contacts.googleSignIn()
      props.onSignedIn()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(null) }
  }

  if (!props.status) return <div className={styles.card}>Loading Google status…</div>

  const errInfo = parseGmailError(err)

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Google account</div>
      {!props.status.credentialsConfigured && (
        <div className={styles.cardSub}>
          Paste a Google OAuth client (ID + secret) in <strong>Settings → Providers → Google</strong> first, then come back.
        </div>
      )}
      {props.status.credentialsConfigured && !props.status.signedIn && (
        <>
          <div className={styles.cardSub}>Sign in to use Gmail for Email. The same sign-in covers Contacts too.</div>
          <div>
            <button className={styles.btnPrimary} onClick={() => void signIn()} disabled={busy !== null}>
              {busy ?? 'Sign in to Google'}
            </button>
          </div>
        </>
      )}
      {props.status.signedIn && (
        <>
          <div className={styles.cardSub}>
            Signed in as <strong>{props.status.accountEmail ?? '(unknown)'}</strong>.
          </div>
          {props.activeTransport !== 'google' && (
            <div>
              <button className={styles.btnPrimary} onClick={() => void activate()} disabled={busy !== null}>
                {busy ?? 'Use Gmail for Email'}
              </button>
            </div>
          )}
          {props.activeTransport === 'google' && (
            <div className={styles.cardSub}>Active transport.</div>
          )}
          <div className={styles.hint}>
            If Gmail calls fail with an "insufficient permission" error, re-authorize to refresh scopes — typical for users who signed in before Gmail support was added.
          </div>
          <div>
            <button className={styles.btn} onClick={() => void reauthorize()} disabled={busy !== null}>
              {busy === 'Re-authorizing…' ? busy : 'Re-authorize Google'}
            </button>
          </div>
        </>
      )}
      {errInfo && (
        <div className={styles.error}>
          {errInfo.message}
          {errInfo.url && (
            <div style={{ marginTop: 6 }}>
              <a
                href={errInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); openExternal(errInfo.url!) }}
                style={{ color: 'var(--color-accent, #e05c84)' }}
              >
                {errInfo.url}
              </a>
            </div>
          )}
          {errInfo.category === 'scope-missing' && (
            <div className={styles.hint} style={{ marginTop: 6 }}>
              Click <strong>Re-authorize Google</strong> above to grant the Gmail scope.
            </div>
          )}
          {errInfo.category === 'api-disabled' && (
            <div className={styles.hint} style={{ marginTop: 6 }}>
              Open the link to enable the Gmail API in your Google Cloud project, then click <strong>Use Gmail for Email</strong> again.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
