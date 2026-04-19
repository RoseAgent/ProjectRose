import { useState, useEffect, useRef } from 'react'
import styles from './ActiveListeningView.module.css'

export function TrainPanel(): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [deployed, setDeployed] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = (): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => stopPolling(), [])

  const handleTrain = async (): Promise<void> => {
    setStatus('running')
    setError('')
    setAccuracy(null)
    setDeployed(null)

    try {
      const { job_id } = await window.api.activeSpeech.train()

      pollRef.current = setInterval(async () => {
        try {
          const result = await window.api.activeSpeech.trainStatus(job_id)
          if (result.status === 'complete') {
            stopPolling()
            setAccuracy(result.accuracy)
            setDeployed(result.deployed)
            setStatus('done')
          } else if (result.status === 'failed') {
            stopPolling()
            setError(result.error || 'Training failed.')
            setStatus('error')
          }
        } catch {
          stopPolling()
          setError('Lost contact with training job.')
          setStatus('error')
        }
      }, 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start training.')
      setStatus('error')
    }
  }

  return (
    <div className={styles.trainPanel}>
      <button
        className={styles.trainBtn}
        onClick={handleTrain}
        disabled={status === 'running'}
      >
        {status === 'running' ? 'Training...' : 'Train Model'}
      </button>

      {status === 'done' && accuracy !== null && (
        <div className={styles.trainResult}>
          <span>Accuracy: {(accuracy * 100).toFixed(1)}%</span>
          <span className={deployed ? styles.trainDeployed : styles.trainNotDeployed}>
            {deployed ? 'Model updated' : 'Below threshold — previous model kept'}
          </span>
        </div>
      )}

      {status === 'error' && <div className={styles.error}>{error}</div>}
    </div>
  )
}
