import { useCallback, useEffect, useState } from 'react'
import type {
  CalendarSettings as CalendarSettingsBlock,
  GoogleCalendarPullPlan,
  GoogleCalendarPushPlan,
  GoogleCalendarSyncStatus
} from '@shared/calendar'
import { useViewStore } from '../../../stores/useViewStore'
import { useAppsDrawerStore } from '../../../stores/useAppsDrawerStore'
import styles from '../rose-contacts/ContactsPage.module.css'

// Drawer-cog SettingsView for rose-calendar. The visual pattern is identical
// to ContactsSettings.GoogleSyncCard — the contacts CSS module is reused so
// the chrome (cards, modals, status badges) matches the rest of the app.

export function CalendarSettings(): JSX.Element {
  return (
    <div className={styles.settingsScroll}>
      <div className={styles.cardRow}>
        <CalendarSyncCard />
      </div>
    </div>
  )
}

type Direction = 'pull' | 'push'

interface ConfirmState {
  direction: Direction
  pullPlan?: GoogleCalendarPullPlan
  pushPlan?: GoogleCalendarPushPlan
}

function CalendarSyncCard(): JSX.Element {
  const [status, setStatus] = useState<GoogleCalendarSyncStatus | null>(null)
  const [calendar, setCalendar] = useState<CalendarSettingsBlock | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const setActiveView = useViewStore((s) => s.setActiveView)
  const setSettingsTarget = useViewStore((s) => s.setSettingsTarget)
  const closeDrawer = useAppsDrawerStore((s) => s.close)

  const refresh = useCallback(async () => {
    try {
      const [s, settings] = await Promise.all([
        window.api.events.googleCalendarGetStatus(),
        window.api.getSettings()
      ])
      setStatus(s)
      setCalendar((settings.calendar as CalendarSettingsBlock | undefined) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar status.')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => { void refresh() }, 6_000)
    return () => clearInterval(id)
  }, [refresh])

  const patch = async (next: CalendarSettingsBlock): Promise<void> => {
    await window.api.setSettings({ calendar: next })
    setCalendar(next)
    void refresh()
  }

  const toggleCalendar = (calendarId: string, on: boolean): void => {
    if (!calendar) return
    const current = calendar.googleSync ?? { lastPullAt: null, lastPushAt: null, syncCalendars: { primary: true } }
    const next: CalendarSettingsBlock = {
      ...calendar,
      googleSync: {
        ...current,
        syncCalendars: { ...current.syncCalendars, [calendarId]: on }
      }
    }
    void patch(next)
  }

  const openProviders = (): void => {
    closeDrawer()
    setActiveView('settings')
    setSettingsTarget('providers')
  }

  const previewPull = async (): Promise<void> => {
    setBusy('Previewing pull from Google…')
    setError(null)
    try {
      const pullPlan = await window.api.events.googleCalendarPreviewPull()
      setConfirm({ direction: 'pull', pullPlan })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed.')
    } finally { setBusy(null) }
  }

  const previewPush = async (): Promise<void> => {
    setBusy('Previewing push to Google…')
    setError(null)
    try {
      const pushPlan = await window.api.events.googleCalendarPreviewPush()
      setConfirm({ direction: 'push', pushPlan })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed.')
    } finally { setBusy(null) }
  }

  const applyConfirm = async (): Promise<void> => {
    if (!confirm) return
    setBusy(confirm.direction === 'pull' ? 'Pulling…' : 'Pushing…')
    try {
      if (confirm.direction === 'pull' && confirm.pullPlan) {
        const result = await window.api.events.googleCalendarApplyPull(confirm.pullPlan)
        if (!result.ok) setError(result.message)
      } else if (confirm.direction === 'push' && confirm.pushPlan) {
        const result = await window.api.events.googleCalendarApplyPush(confirm.pushPlan)
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
  const scopeGranted = status?.scopeGranted ?? false
  const syncCalendars = calendar?.googleSync?.syncCalendars ?? { primary: true }

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <span className={styles.cardTitle}>Google Calendar sync</span>
        <span
          className={
            signedIn
              ? scopeGranted
                ? styles.statusOk
                : styles.statusMuted
              : credsConfigured
                ? styles.statusMuted
                : styles.statusOff
          }
        >
          {signedIn
            ? scopeGranted ? 'signed in' : 'needs re-consent'
            : credsConfigured ? 'signed out' : 'not configured'}
        </span>
      </div>
      <div className={styles.cardSub}>
        Pull events from Google Calendar into your local calendar, or push
        local events to Google. Each direction is a separate, confirmed action
        — nothing syncs in the background. Invitations to attendees are sent
        by Google when a synced event is pushed or updated.
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

      {signedIn && scopeGranted && status?.calendars && status.calendars.length > 0 && (
        <div className={styles.fieldRowVertical}>
          <span className={styles.label}>Sync these calendars</span>
          <div className={styles.kindFilterGrid}>
            {status.calendars.map((cal) => (
              <label key={cal.id} className={styles.kindFilterRow}>
                <input
                  type="checkbox"
                  checked={syncCalendars[cal.id] !== false}
                  disabled={!calendar}
                  onChange={(e) => toggleCalendar(cal.id, e.target.checked)}
                />
                <span>{cal.summary}{cal.primary ? ' ⭐' : ''}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {signedIn && !scopeGranted && (
        <div className={styles.hint}>
          The Google Calendar scope hasn't been granted yet. Sign out and back
          in (Settings → Providers → Google) to re-consent with calendar access.
        </div>
      )}

      {!signedIn && (
        <div className={styles.hint}>
          {credsConfigured
            ? 'Connect a Google account in Settings → Providers to enable sync.'
            : 'Add a Google OAuth client ID and secret in Settings → Providers → Google to enable sync.'}
        </div>
      )}

      <div className={styles.btnRow}>
        {!signedIn ? (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openProviders}>
            Open Providers →
          </button>
        ) : !scopeGranted ? (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openProviders}>
            Re-consent in Providers →
          </button>
        ) : (
          <>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={previewPull}
              disabled={busy !== null}
            >
              Pull from Google…
            </button>
            <button
              className={styles.btn}
              onClick={previewPush}
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
    const { fetched, create, update, unchanged, skippedCalendars } = state.pullPlan
    const hasChanges = create.length + update.length > 0
    return (
      <div className={styles.modalScrim}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <span className={styles.modalTitle}>Pull from Google · Confirm</span>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.modalSection}>
              Google returned <strong>{fetched}</strong> event{fetched === 1 ? '' : 's'} across the selected calendars.
              {' '}{hasChanges ? 'The following changes will apply to your local calendar:' : 'Nothing to apply — already in sync.'}
            </div>
            {create.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Will create ({create.length})</div>
                <ul className={styles.modalList}>
                  {create.slice(0, 10).map((c) => (
                    <li key={c.googleId}>{c.start} — {c.summary}{c.isRecurringMaster ? ' (recurring)' : ''}</li>
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
                    <li key={u.googleId}>{u.start} — {u.summary}</li>
                  ))}
                  {update.length > 10 && <li>…and {update.length - 10} more</li>}
                </ul>
              </div>
            )}
            {skippedCalendars.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Skipped calendars ({skippedCalendars.length})</div>
                <ul className={styles.modalList}>
                  {skippedCalendars.map((s) => <li key={s.id}>{s.summary}</li>)}
                </ul>
              </div>
            )}
            {unchanged > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Unchanged</div>
                {unchanged} event{unchanged === 1 ? '' : 's'} already in sync.
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
              You have <strong>{localCount}</strong> local event{localCount === 1 ? '' : 's'}.
              {' '}{hasChanges
                ? 'The following will be applied to your Google Calendar (attendees will be notified by Google):'
                : 'Nothing to push — every local event is already in sync.'}
            </div>
            {create.length > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionHead}>Will create in Google ({create.length})</div>
                <ul className={styles.modalList}>
                  {create.slice(0, 10).map((c) => (
                    <li key={`${c.ref.date}/${c.ref.slug}`}>{c.start} — {c.summary} → <em>{c.targetCalendarId}</em></li>
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
                    <li key={`${u.ref.date}/${u.ref.slug}`}>{u.summary}
                      <ul className={styles.modalSubList}>
                        {u.fields.slice(0, 6).map((f, i) => <li key={i}>{f}</li>)}
                        {u.fields.length > 6 && <li>…and {u.fields.length - 6} more</li>}
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
                  {skip.slice(0, 10).map((s, i) => (
                    <li key={`${s.ref.date}/${s.ref.slug}-${i}`}>{s.ref.date}/{s.ref.slug} — {s.reason}</li>
                  ))}
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
