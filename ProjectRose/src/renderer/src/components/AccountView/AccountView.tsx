import { useEffect, useState, useCallback } from 'react'
import styles from './AccountView.module.css'

interface AuthStatus {
  loggedIn: boolean
  email: string
  plan: string
}

export function AccountView(): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>({ loggedIn: false, email: '', plan: '' })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const s = await window.api.auth.getStatus()
      setStatus(s)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const cleanup = window.api.auth.onChanged((data) => {
      setStatus((prev) => ({ ...prev, loggedIn: data.loggedIn, email: data.email }))
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
              <span className={styles.badge}>{(status.plan ?? 'free').toUpperCase()}</span>
            </div>
          </div>

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
            {actionLoading ? 'SIGNING IN...' : 'SIGN IN →'}
          </button>
        </div>
      )}
    </div>
  )
}
