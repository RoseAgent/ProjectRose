import { useState } from 'react'
import { useGitStore } from './store'
import { DiffFileList } from './DiffFileList'
import { DiffEditor } from './DiffEditor'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './GitView.module.css'

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

export function CommitDetail(): JSX.Element {
  const selectedCommit = useGitStore((s) => s.selectedCommit)
  const selectedFile = useGitStore((s) => s.selectedFile)
  const selectCommitFile = useGitStore((s) => s.selectCommitFile)
  const cherryPick = useGitStore((s) => s.cherryPick)
  const revertOp = useGitStore((s) => s.revert)
  const reset = useGitStore((s) => s.reset)
  const tagCreate = useGitStore((s) => s.tagCreate)

  const [confirmReset, setConfirmReset] = useState<{ target: string; mode: 'soft' | 'mixed' | 'hard' } | null>(null)

  if (!selectedCommit) {
    return (
      <div className={styles.paneNoBorder}>
        <div className={styles.header}>Commit</div>
        <div className={styles.empty}>Select a commit</div>
      </div>
    )
  }

  return (
    <div className={styles.paneNoBorder}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          <span className={styles.shortSha}>{selectedCommit.shortSha}</span>
          <span className={styles.detailSubject}>{selectedCommit.subject}</span>
        </div>
        <div className={styles.detailMeta}>
          <span>{selectedCommit.authorName} &lt;{selectedCommit.authorEmail}&gt;</span>
          <span>{formatDate(selectedCommit.timestamp)}</span>
          {selectedCommit.parents.length > 1 && <span>merge ({selectedCommit.parents.length} parents)</span>}
        </div>
        {selectedCommit.body && <div className={styles.detailBody}>{selectedCommit.body}</div>}
      </div>
      <div className={styles.actionBar}>
        <button className={styles.btn} onClick={() => cherryPick(selectedCommit.sha)}>Cherry-pick</button>
        <button className={styles.btn} onClick={() => revertOp(selectedCommit.sha)}>Revert</button>
        <button
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={() => setConfirmReset({ target: selectedCommit.sha, mode: 'hard' })}
        >
          Reset --hard here
        </button>
        <button
          className={styles.btn}
          onClick={() => setConfirmReset({ target: selectedCommit.sha, mode: 'mixed' })}
        >
          Reset --mixed here
        </button>
        <button
          className={styles.btn}
          onClick={() => setConfirmReset({ target: selectedCommit.sha, mode: 'soft' })}
        >
          Reset --soft here
        </button>
        <button
          className={styles.btn}
          onClick={() => {
            const n = window.prompt('Tag name:')
            if (n) tagCreate(n, selectedCommit.sha)
          }}
        >
          Tag here
        </button>
      </div>
      <DiffFileList
        files={selectedCommit.files}
        activePath={selectedFile?.source === 'commit' ? selectedFile.path : null}
        onSelect={(p) => selectCommitFile(p)}
      />
      {selectedFile && selectedFile.source === 'commit' ? (
        <DiffEditor
          oldContent={selectedFile.oldContent}
          newContent={selectedFile.newContent}
          binary={selectedFile.binary}
          language={selectedFile.path}
        />
      ) : (
        <div className={styles.empty} style={{ flex: 1 }}>Select a file to view diff</div>
      )}
      {confirmReset && (
        <ConfirmDialog
          title={`Reset --${confirmReset.mode}`}
          body={
            confirmReset.mode === 'hard'
              ? `Reset current branch to ${confirmReset.target.slice(0, 7)} with --hard?\n\nThis DISCARDS all working-tree and index changes. This CANNOT be undone.`
              : `Reset current branch to ${confirmReset.target.slice(0, 7)} with --${confirmReset.mode}?`
          }
          confirmLabel="Reset"
          danger={confirmReset.mode === 'hard'}
          onCancel={() => setConfirmReset(null)}
          onConfirm={() => {
            reset(confirmReset.target, confirmReset.mode)
            setConfirmReset(null)
          }}
        />
      )}
    </div>
  )
}
