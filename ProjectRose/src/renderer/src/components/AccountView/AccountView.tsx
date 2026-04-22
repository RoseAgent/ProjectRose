import { useEffect, useState, useCallback } from 'react'
import styles from './AccountView.module.css'

interface AuthStatus {
  loggedIn: boolean
  email: string
  plan: string
}

interface UsageData {
  plan: string
  month: string
  tokensUsed: number
  tokensLimit: number
}

export function AccountView(): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>({ loggedIn: false, email: '', plan: '' })
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const s = await window.api.auth.getStatus()
      setStatus(s)
      if (s.loggedIn) fetchUsage(s)
    } finally {
      setLoading(false)
    }
  }, [])

  async function fetchUsage(s: AuthStatus) {
    if (!s.loggedIn) return
    try {
      const settings = await window.api.getSettings()
      const token = (settings as { providerKeys?: { projectrose?: { accessToken?: string } } })
        ?.providerKeys?.projectrose?.accessToken
      if (!token) return
      const res = await fetch('https://projectrose.ai/api/account/usage', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setUsage(await res.json())
    } catch { /* offline */ }
  }

  useEffect(() => {
    fetchStatus()
    const cleanup = window.api.auth.onChanged((data) => {
      setStatus((prev) => ({ ...prev, loggedIn: data.loggedIn, email: data.email }))
      if (!data.loggedIn) setUsage(null)
    })
    return cleanup
  }, [fetchStatus])

  async function handleLogin() {
    setActionLoading(true)
    try {
      await window.api.auth.login()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleLogout() {
    setActionLoading(true)
    try {
      await window.api.auth.logout()
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div className={styles.container}><p className={styles.muted}>Loading...</p></div>
  }

  const usagePct = usage ? Math.min(100, Math.round((usage.tokensUsed / usage.tokensLimit) * 100)) : 0

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.label}>ACCOUNT</div>
        <h2 className={styles.heading}>ProjectRose Account</h2>
      </div>

      {status.loggedIn ? (
        <>
          <div className={styles.section}>
            <div className={styles.row}>
              <span className={styles.field}>Email</span>
              <span className={styles.value}>{status.email}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.field}>Plan</span>
              <span className={styles.badge}>{(usage?.plan ?? status.plan ?? 'free').toUpperCase()}</span>
            </div>
          </div>

          {usage && (
            <div className={styles.section}>
              <div className={styles.label}>USAGE — {usage.month}</div>
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} style={{ width: `${usagePct}%` }} />
              </div>
              <div className={styles.usageText}>
                {usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()} tokens ({usagePct}%)
              </div>
            </div>
          )}

          <div className={styles.section}>
            <button
              className={styles.btnSecondary}
              onClick={handleLogout}
              disabled={actionLoading}
            >
              {actionLoading ? 'SIGNING OUT...' : 'SIGN OUT →'}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.section}>
          <p className={styles.description}>
            Sign in to use the managed AI endpoint backed by your ProjectRose subscription.
            Your chat will route through our servers — no API keys needed.
          </p>
          <button
            className={styles.btnPrimary}
            onClick={handleLogin}
            disabled={actionLoading}
          >
            {actionLoading ? 'OPENING BROWSER...' : 'SIGN IN WITH ACCOUNT →'}
          </button>
        </div>
      )}
    </div>
  )
}
