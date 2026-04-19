import { useState } from 'react'
import styles from './ActiveListeningView.module.css'

interface Props {
  utteranceId: number
  onLabel: (utteranceId: number, speakerName: string) => void
  onCancel: () => void
}

export function LabelSpeakerDialog({ utteranceId, onLabel, onCancel }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Please enter a name.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await window.api.activeSpeech.labelSpeaker({
        utteranceId,
        speakerName: name.trim()
      })
      onLabel(utteranceId, name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save label.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.labelDialog}>
        <h3 className={styles.labelTitle}>Who is speaking?</h3>
        <input
          className={styles.labelInput}
          type="text"
          placeholder="Enter speaker name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.labelActions}>
          <button className={styles.labelCancel} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className={styles.labelSubmit} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
