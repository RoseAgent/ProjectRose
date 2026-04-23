import { useEffect } from 'react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useViewStore } from '@renderer/stores/useViewStore'
import { useGitStore } from '@renderer/stores/useGitStore'
import { LeftTabs } from './LeftTabs'
import { HistoryList } from './HistoryList'
import { BranchList } from './BranchList'
import { TagList } from './TagList'
import { StashList } from './StashList'
import { CommitDetail } from './CommitDetail'
import { StagingArea } from './StagingArea'
import { DiffEditor } from './DiffEditor'
import styles from './GitView.module.css'

export function GitView(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath)
  const activeView = useViewStore((s) => s.activeView)
  const cwd = useGitStore((s) => s.cwd)
  const setCwd = useGitStore((s) => s.setCwd)
  const isRepo = useGitStore((s) => s.isRepo)
  const refreshAll = useGitStore((s) => s.refreshAll)
  const subscribeToWatchers = useGitStore((s) => s.subscribeToWatchers)
  const leftTab = useGitStore((s) => s.leftTab)
  const selectedSha = useGitStore((s) => s.selectedSha)
  const selectedFile = useGitStore((s) => s.selectedFile)
  const status = useGitStore((s) => s.status)
  const fetchOp = useGitStore((s) => s.fetch)
  const pullOp = useGitStore((s) => s.pull)
  const pushOp = useGitStore((s) => s.push)
  const error = useGitStore((s) => s.error)
  const clearError = useGitStore((s) => s.clearError)

  useEffect(() => {
    if (activeView !== 'rose-git') return
    setCwd(rootPath)
  }, [activeView, rootPath, setCwd])

  useEffect(() => {
    if (!cwd) return
    void refreshAll()
    const cleanup = subscribeToWatchers()
    return cleanup
  }, [cwd, refreshAll, subscribeToWatchers])

  if (activeView !== 'rose-git') {
    return <div className={styles.container} />
  }

  if (!rootPath) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Open a folder to use Git</div>
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Not a git repository</div>
      </div>
    )
  }

  const middle =
    leftTab === 'history' ? <HistoryList />
    : leftTab === 'branches' ? <BranchList />
    : leftTab === 'tags' ? <TagList />
    : <StashList />

  const showWorkingDiff = selectedFile && selectedFile.source !== 'commit'

  return (
    <div className={styles.container}>
      {error && (
        <div className={styles.errorBar}>
          <span>{error}</span>
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}
      <div className={styles.opsBar}>
        <button className={styles.btn} onClick={() => void fetchOp()}>Fetch</button>
        <button className={styles.btn} onClick={() => void pullOp()}>Pull</button>
        <button className={styles.btn} onClick={() => void pushOp()}>Push</button>
        <button
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={() => {
            const b = window.prompt('Remote branch to force-push (with lease). Leave blank to push current.')
            if (b !== null) {
              if (window.confirm('Force push (with lease)?')) {
                pushOp(undefined, b || undefined, true)
              }
            }
          }}
        >
          Force push
        </button>
        <span style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {status.currentBranch ? `on ${status.currentBranch}` : 'detached HEAD'}
          {status.upstream ? ` (↑${status.ahead}/↓${status.behind})` : ''}
        </span>
      </div>
      <div className={styles.topGrid}>
        <LeftTabs />
        {middle}
        {selectedSha ? (
          <CommitDetail />
        ) : showWorkingDiff && selectedFile ? (
          <div className={styles.paneNoBorder}>
            <div className={styles.header}>
              {selectedFile.source === 'staged' ? 'Staged diff' : 'Working-tree diff'} — {selectedFile.path}
            </div>
            <DiffEditor
              oldContent={selectedFile.oldContent}
              newContent={selectedFile.newContent}
              binary={selectedFile.binary}
              language={selectedFile.path}
            />
          </div>
        ) : (
          <div className={styles.paneNoBorder}>
            <div className={styles.header}>Detail</div>
            <div className={styles.empty}>Select a commit or a changed file</div>
          </div>
        )}
      </div>
      <StagingArea />
    </div>
  )
}
