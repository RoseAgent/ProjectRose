import { useState } from 'react'
import styles from './SetupWizard.module.css'

interface SetupWizardProps {
  rootPath: string
  onComplete: () => void
}

type Autonomy = 'low' | 'medium' | 'high'
type CommStyle = 'direct' | 'collaborative' | 'adaptive'
type Depth = 'brief' | 'detailed' | 'adaptive'
type Proactivity = 'reactive' | 'balanced' | 'proactive'
type Step = 'userName' | 'agentConfig'

export function SetupWizard({ rootPath, onComplete }: SetupWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>('userName')
  const [userName, setUserName] = useState('')
  const [name, setName] = useState('')
  const [identity, setIdentity] = useState('')
  const [autonomy, setAutonomy] = useState<Autonomy>('high')
  const [commStyle, setCommStyle] = useState<CommStyle>('direct')
  const [depth, setDepth] = useState<Depth>('adaptive')
  const [proactivity, setProactivity] = useState<Proactivity>('balanced')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUserNameNext = (): void => {
    if (!userName.trim()) {
      setError('Please enter your name.')
      return
    }
    setError('')
    setStep('agentConfig')
  }

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Please give your AI a name.')
      return
    }
    if (!identity.trim()) {
      setError("Please describe your AI's identity.")
      return
    }
    setError('')
    setLoading(true)
    try {
      await window.api.initProject({
        rootPath,
        name: name.trim(),
        identity: identity.trim(),
        autonomy,
        userName: userName.trim(),
        commStyle,
        depth,
        proactivity
      })
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to initialize project.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'userName') {
    return (
      <div className={styles.overlay}>
        <div className={styles.dialog}>
          <div className={styles.header}>
            <div className={styles.title}>Welcome to ProjectRose</div>
            <div className={styles.subtitle}>What is your name?</div>
          </div>

          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label}>Your Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Andrew"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUserNameNext()}
                autoFocus
              />
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button className={styles.submitBtn} onClick={handleUserNameNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    )
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

          <div className={styles.field}>
            <label className={styles.label}>Communication Style</label>
            <div className={styles.autonomyGroup}>
              {([
                { value: 'direct', label: 'Direct', desc: 'Concise, honest, no filler' },
                { value: 'collaborative', label: 'Collaborative', desc: 'Thinks out loud, asks questions' },
                { value: 'adaptive', label: 'Adaptive', desc: 'Reads the room, adjusts' }
              ] as { value: CommStyle; label: string; desc: string }[]).map(({ value, label, desc }) => (
                <button
                  key={value}
                  className={`${styles.autonomyBtn} ${commStyle === value ? styles.autonomyActive : ''}`}
                  onClick={() => setCommStyle(value)}
                  type="button"
                >
                  <span className={styles.autonomyLabel}>{label}</span>
                  <span className={styles.autonomyDesc}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Technical Depth</label>
            <div className={styles.autonomyGroup}>
              {([
                { value: 'brief', label: 'Brief', desc: 'Answers only, skip explanations' },
                { value: 'detailed', label: 'Detailed', desc: 'Explain reasoning and trade-offs' },
                { value: 'adaptive', label: 'Adaptive', desc: 'Matches task complexity' }
              ] as { value: Depth; label: string; desc: string }[]).map(({ value, label, desc }) => (
                <button
                  key={value}
                  className={`${styles.autonomyBtn} ${depth === value ? styles.autonomyActive : ''}`}
                  onClick={() => setDepth(value)}
                  type="button"
                >
                  <span className={styles.autonomyLabel}>{label}</span>
                  <span className={styles.autonomyDesc}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Proactivity</label>
            <div className={styles.autonomyGroup}>
              {([
                { value: 'reactive', label: 'Reactive', desc: 'Only what is asked' },
                { value: 'balanced', label: 'Balanced', desc: 'Flags obvious issues' },
                { value: 'proactive', label: 'Proactive', desc: 'Surfaces suggestions actively' }
              ] as { value: Proactivity; label: string; desc: string }[]).map(({ value, label, desc }) => (
                <button
                  key={value}
                  className={`${styles.autonomyBtn} ${proactivity === value ? styles.autonomyActive : ''}`}
                  onClick={() => setProactivity(value)}
                  type="button"
                >
                  <span className={styles.autonomyLabel}>{label}</span>
                  <span className={styles.autonomyDesc}>{desc}</span>
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
