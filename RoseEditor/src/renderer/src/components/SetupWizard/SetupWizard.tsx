import { useState } from 'react'
import styles from './SetupWizard.module.css'

interface SetupWizardProps {
  rootPath: string
  onComplete: () => void
}

type Autonomy = 'low' | 'medium' | 'high'

export function SetupWizard({ rootPath, onComplete }: SetupWizardProps): JSX.Element {
  const [name, setName] = useState('')
  const [identity, setIdentity] = useState('')
  const [autonomy, setAutonomy] = useState<Autonomy>('high')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Please give your AI a name.')
      return
    }
    if (!identity.trim()) {
      setError('Please describe your AI\'s identity.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await window.api.initProject({ rootPath, name: name.trim(), identity: identity.trim(), autonomy })
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to initialize project.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.title}>Initialize AI Agent</div>
          <div className={styles.subtitle}>Configure your AI for this project</div>
        </div>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label}>AI Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Rose"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Identity</label>
            <textarea
              className={styles.textarea}
              placeholder="Describe your AI's personality and focus..."
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              rows={4}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Autonomy Level</label>
            <div className={styles.autonomyGroup}>
              {(['low', 'medium', 'high'] as Autonomy[]).map((level) => (
                <button
                  key={level}
                  className={`${styles.autonomyBtn} ${autonomy === level ? styles.autonomyActive : ''}`}
                  onClick={() => setAutonomy(level)}
                  type="button"
                >
                  <span className={styles.autonomyLabel}>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
                  <span className={styles.autonomyDesc}>
                    {level === 'low' && 'Ask before every tool call'}
                    {level === 'medium' && 'Ask before destructive actions'}
                    {level === 'high' && 'Act independently'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Initializing...' : 'Initialize Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
