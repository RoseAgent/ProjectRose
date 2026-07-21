import { useCallback, useEffect, useState } from 'react'
import {
  CONTACT_KINDS,
  type ContactKind,
  type ContactsSettings as ContactsSettingsBlock,
  type GooglePullPlan,
  type GooglePushPlan,
  type GoogleSyncStatus
} from '@shared/contacts'
import { useViewStore } from '../../../stores/useViewStore'
import { useAppsDrawerStore } from '../../../stores/useAppsDrawerStore'
import styles from './ContactsPage.module.css'

// Drawer-cog SettingsView for the rose-contacts built-in extension.
// Contains the Google Contacts sync card.
//
// The page view (list + per-field detail) remounts on mode switch, so any
// pull/push changes show up automatically when the user clicks back to the
// page — no cross-component broadcast needed.

export function ContactsSettings(): JSX.Element {
  return (
    <div className={styles.settingsScroll}>
      <div className={styles.cardRow}>
        <GoogleSyncCard />
      </div>
    </div>
  )
}

function kindBadgeClass(kind: ContactKind): string {
  switch (kind) {
    case 'person':   return `${styles.kindBadge} ${styles.kindPerson}`
    case 'business': return `${styles.kindBadge} ${styles.kindBusiness}`
    case 'website':  return `${styles.kindBadge} ${styles.kindWebsite}`
    case 'other':    return `${styles.kindBadge} ${styles.kindOther}`
  }
}

// ── Google Sync card ─────────────────────────────────────────────────────

type Direction = 'pull' | 'push'

interface ConfirmState {
  direction: Direction
  pullPlan?: GooglePullPlan
  pushPlan?: GooglePushPlan
}

function GoogleSyncCard(): JSX.Element {
  const [status, setStatus] = useState<GoogleSyncStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [contacts, setContacts] = useState<ContactsSettingsBlock | null>(null)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const setSettingsTarget = useViewStore((s) => s.setSettingsTarget)
  const closeDrawer = useAppsDrawerStore((s) => s.close)

  const refresh = useCallback(async () => {
    const [s, settings] = await Promise.all([
      window.api.contacts.googleGetStatus(),
      window.api.getSettings()
    ])
    setStatus(s)
    setContacts((settings.contacts as ContactsSettingsBlock | undefined) ?? null)
  }, [])

  useEffect(() => {
    void refresh()
    // Poll while the user might be signing in via the Providers tab — once
    // they come back, the card reflects the new status without needing a
    // tab switch.
    const id = setInterval(() => { void refresh() }, 4_000)
    return () => clearInterval(id)
  }, [refresh])

  const patchGoogle = async (patch: { syncKinds?: Record<ContactKind, boolean> }): Promise<void> => {
    if (!contacts) return
    const next: ContactsSettingsBlock = {
      ...contacts,
      googleSync: { ...contacts.googleSync, ...patch }
    }
    await window.api.setSettings({ contacts: next })
    setContacts(next)
    void refresh()
  }

  const toggleKind = (kind: ContactKind, on: boolean): void => {
    if (!contacts) return
    const current = contacts.googleSync.syncKinds
    void patchGoogle({ syncKinds: { ...current, [kind]: on } })
  }

  const openProviders = (): void => {
    closeDrawer()
    setActiveView('settings')
    setSettingsTarget('providers')
  }

  const openPullConfirm = async (): Promise<void> => {
    setBusy('Previewing pull from Google…')
    setError(null)
    try {
      const pullPlan = await window.api.contacts.googlePreviewPull()
      setConfirm({ direction: 'pull', pullPlan })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally { setBusy(null) }
  }

  const openPushConfirm = async (): Promise<void> => {
    setBusy('Previewing push to Google…')
    setError(null)
    try {
      const pushPlan = await window.api.contacts.googlePreviewPush()
      setConfirm({ direction: 'push', pushPlan })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally { setBusy(null) }
  }

  const applyConfirm = async (): Promise<void> => {
    if (!confirm) return
    setBusy(confirm.direction === 'pull' ? 'Pulling…' : 'Pushing…')
    try {
      if (confirm.direction === 'pull' && confirm.pullPlan) {
        const result = await window.api.contacts.googleApplyPull(confirm.pullPlan)
        if (!result.ok) setError(result.message)
      } else if (confirm.direction === 'push' && confirm.pushPlan) {
        const result = await window.api.contacts.googleApplyPush(confirm.pushPlan)
        if (!result.ok) setError(result.message)
      }
      setConfirm(null)
      void refresh()
    } finally { setBusy(null) }
  }

  const fmtTime = (ms: number | null | undefined): string =>
    !ms ? '—' : new Date(ms).toLocaleString()

  const signedIn = status?.signedIn ?? false
  const credsConfigured = status?.credentialsConfigured ?? false
  const syncKinds = contacts?.googleSync?.syncKinds ?? { person: true, business: true, website: false, other: false }

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <span className={styles.cardTitle}>Google Contacts sync</span>
        <span
          className={
            signedIn
              ? styles.statusOk
              : credsConfigured
                ? styles.statusMuted
                : styles.statusOff
          }
        >
          {signedIn ? 'signed in' : credsConfigured ? 'signed out' : 'not configured'}
        </span>
      </div>
      <div className={styles.cardSub}>
        Pull contacts from Google into your local contacts, or push local
        contacts to Google. Each direction is a separate, confirmed action —
        nothing syncs in the background.
      </div>

      {signedIn && status?.accountEmail && (
        <div className={styles.row}>
          <span className={styles.label}>Account</span>
          <span className={styles.value}>{status.accountEmail}</span>
        </div>
      )}
      <div className={styles.row}>
        <span className={styles.label}>Last pulled</span>
        <span className={styles.value}>{fmtTime(status?.lastPullAt)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Last pushed</span>
        <span className={styles.value}>{fmtTime(status?.lastPushAt)}</span>
      </div>

      <div className={styles.fieldRowVertical}>
        <span className={styles.label}>Sync these kinds</span>
        <div className={styles.kindFilterGrid}>
          {CONTACT_KINDS.map((k) => (
            <label key={k} className={styles.kindFilterRow}>
              <input
                type="checkbox"
                checked={!!syncKinds[k]}
                disabled={!contacts}
                onChange={(e) => toggleKind(k, e.target.checked)}
              />
              <span className={kindBadgeClass(k)}>{k}</span>
            </label>
          ))}
        </div>
        <div className={styles.hint}>
          Only contacts whose kind is checked here round-trip with Google.
          New contacts pulled from Google default to <em>person</em>; you can
          reclassify them with the dropdown in the editor.
        </div>
      </div>

      {!signedIn && (
        <div className={styles.hint}>
          {credsConfigured
            ? 'Connect a Google account in Settings → Providers to enable sync.'
            : 'Add a Google OAuth client ID and secret in Settings → Providers → Google to enable sync.'}
        </div>
      )}

      <div className={styles.btnRow}>
        {!signedIn ? (
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={openProviders}
          >
            Open Providers →
          </button>
        ) : (
          <>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={openPullConfirm}
              disabled={busy !== null}
            >
              Pull from Google…
            </button>
            <button
              className={styles.btn}
              onClick={openPushConfirm}
              disabled={busy !== null}
            >
              Push to Google…
            </button>
          </>
        )}
      </div>

      {busy && <div className={styles.busy}>{busy}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {confirm && (
        <ConfirmModal
          state={confirm}
          busy={busy !== null}
          onCancel={() => setConfirm(null)}
          onApply={applyConfirm}
        />
      )}
    </div>
  )
}

// ── Pull/Push confirm modal ──────────────────────────────────────────────

function ConfirmModal({
  state,
  busy,
  onCancel,
  onApply
}: {
  state: ConfirmState
  busy: boolean
  onCancel: () => void
  onApply: () => void
}): JSX.Element {
  if (state.direction === 'pull' && state.pullPlan) {
    const { fetched, create, update, unchanged, skippedByKind } = state.pullPlan
    const hasChanges = create.length + update.length > 0

    return (
      <div className={styles.modalScrim}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <span className={styles.modalTitle}>Pull from Google · Confirm</span>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.modalSection}>
              Google returned <strong>{fetched}</strong> contact{fetched === 1 ? '' : 's'}.
              {' '}{hasChanges ? 'The following changes will be applied to your local contacts:' : 'Nothing to apply — every contact is already in sync.'}
            </div>
            {create.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Will create ({create.length})</div>
                <ul className={styles.modalList}>
                  {create.slice(0, 10).map((c) => (
                    <li key={c.entity}>
                      {c.entity} <span className={kindBadgeClass(c.kind)}>{c.kind}</span>
                    </li>
                  ))}
                  {create.length > 10 && <li>…and {create.length - 10} more</li>}
                </ul>
              </div>
            )}
            {update.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Will update ({update.length})</div>
                <ul className={styles.modalList}>
                  {update.slice(0, 10).map((u) => (
                    <li key={u.entity}>
                      {u.entity} <span className={kindBadgeClass(u.kind)}>{u.kind}</span>
                    </li>
                  ))}
                  {update.length > 10 && <li>…and {update.length - 10} more</li>}
                </ul>
              </div>
            )}
            {skippedByKind.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Skipped by kind filter ({skippedByKind.length})</div>
                <ul className={styles.modalList}>
                  {skippedByKind.slice(0, 10).map((s) => (
                    <li key={s.entity}>
                      {s.entity} <span className={kindBadgeClass(s.kind)}>{s.kind}</span>
                    </li>
                  ))}
                  {skippedByKind.length > 10 && <li>…and {skippedByKind.length - 10} more</li>}
                </ul>
              </div>
            )}
            {unchanged > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Unchanged</div>
                {unchanged} contact{unchanged === 1 ? '' : 's'} already up to date.
              </div>
            )}
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btn} onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onApply}
              disabled={busy || !hasChanges}
            >
              Pull
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state.direction === 'push' && state.pushPlan) {
    const { localCount, create, update, skip } = state.pushPlan
    const hasChanges = create.length + update.length > 0

    return (
      <div className={styles.modalScrim}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <span className={styles.modalTitle}>Push to Google · Confirm</span>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.modalSection}>
              You have <strong>{localCount}</strong> local contact{localCount === 1 ? '' : 's'}.
              {' '}{hasChanges
                ? 'The following will be applied to your Google Contacts (additive — Google\'s existing fields are never removed):'
                : 'Nothing to push — every eligible local contact is already in sync with Google.'}
            </div>
            {create.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Will create in Google ({create.length})</div>
                <ul className={styles.modalList}>
                  {create.slice(0, 10).map((c) => (
                    <li key={c.entity}>
                      <div>
                        {c.entity} <span className={kindBadgeClass(c.kind)}>{c.kind}</span>
                      </div>
                      {c.fields.length > 0 && (
                        <ul className={styles.modalSubList}>
                          {c.fields.slice(0, 6).map((f, i) => <li key={i}>{f}</li>)}
                          {c.fields.length > 6 && <li>…and {c.fields.length - 6} more</li>}
                        </ul>
                      )}
                    </li>
                  ))}
                  {create.length > 10 && <li>…and {create.length - 10} more</li>}
                </ul>
              </div>
            )}
            {update.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Will update in Google ({update.length})</div>
                <ul className={styles.modalList}>
                  {update.slice(0, 10).map((u) => (
                    <li key={u.entity}>
                      <div>
                        {u.entity} <span className={kindBadgeClass(u.kind)}>{u.kind}</span>
                      </div>
                      <ul className={styles.modalSubList}>
                        {u.additions.slice(0, 6).map((f, i) => <li key={i}>{f}</li>)}
                        {u.additions.length > 6 && <li>…and {u.additions.length - 6} more</li>}
                      </ul>
                    </li>
                  ))}
                  {update.length > 10 && <li>…and {update.length - 10} more</li>}
                </ul>
              </div>
            )}
            {skip.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Skipped ({skip.length})</div>
                <ul className={styles.modalList}>
                  {skip.slice(0, 10).map((s) => (
                    <li key={s.entity}>
                      {s.entity} <span className={kindBadgeClass(s.kind)}>{s.kind}</span> — {s.reason}
                    </li>
                  ))}
                  {skip.length > 10 && <li>…and {skip.length - 10} more</li>}
                </ul>
              </div>
            )}
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btn} onClick={onCancel} disabled={busy}>Cancel</button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onApply}
              disabled={busy || !hasChanges}
            >
              Push
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <></>
}
