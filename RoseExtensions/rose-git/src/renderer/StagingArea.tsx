import { useMemo } from 'react'
import { useGitStore } from '@renderer/stores/useGitStore'
import styles from './GitView.module.css'
import { StagingTree } from './StagingTree'

export function StagingArea(): JSX.Element {
  const status = useGitStore((s) => s.status)
  const collapsed = useGitStore((s) => s.stagingCollapsed)
  const toggleCollapsed = useGitStore((s) => s.toggleStagingCollapsed)
  const stagePaths = useGitStore((s) => s.stagePaths)
  const unstagePaths = useGitStore((s) => s.unstagePaths)
  const discardPaths = useGitStore((s) => s.discardPaths)
  const selectWorkingFile = useGitStore((s) => s.selectWorkingFile)
  const selectedFile = useGitStore((s) => s.selectedFile)
  const commitMessage = useGitStore((s) => s.commitMessage)
  const setCommitMessage = useGitStore((s) => s.setCommitMessage)
  const amend = useGitStore((s) => s.amend)
  const setAmend = useGitStore((s) => s.setAmend)
  const prefillAmendMessage = useGitStore((s) => s.prefillAmendMessage)
  const commit = useGitStore((s) => s.commit)
  const isOperating = useGitStore((s) => s.isOperating)

  const unstaged = useMemo(() => [...status.unstaged, ...status.untracked], [status])
  const staged = status.staged
  const conflicted = status.conflicted

  const stageAll = (): void => {
    const paths = [...unstaged.map((f) => f.path), ...conflicted.map((f) => f.path)]
    if (paths.length) stagePaths(paths)
  }
  const unstageAll = (): void => {
    const paths = staged.map((f) => f.path)
    if (paths.length) unstagePaths(paths)
  }

  const canCommit =
    (commitMessage.trim().length > 0 && (staged.length > 0 || amend)) && !isOperating

  return (
    <div className={`${styles.staging} ${collapsed ? styles.stagingCollapsed : ''}`}>
      <div className={styles.stagingHeader} onClick={toggleCollapsed}>
        <span>
          {collapsed ? '▸' : '▾'} Changes — {unstaged.length} unstaged · {staged.length} staged
          {conflicted.length > 0 ? ` · ${conflicted.length} conflicts` : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {status.currentBranch || '(detached)'}
        </span>
      </div>
      {!collapsed && (
        <div className={styles.stagingBody}>
          <div className={styles.stagingPane}>
            <div className={styles.stagingPaneHeader}>
              <span>Unstaged</span>
              <button className={styles.btn} onClick={stageAll} disabled={unstaged.length === 0 && conflicted.length === 0}>
                Stage all
              </button>
            </div>
            <div className={styles.stagingList}>
              <StagingTree
                files={[...conflicted, ...unstaged]}
                side="unstaged"
                selectedPath={selectedFile?.path}
                selectedSource={selectedFile?.source}
                onSelect={(p) => selectWorkingFile(p, false)}
                onPrimaryAction={stagePaths}
                onDiscard={discardPaths}
                emptyMessage="Clean"
              />
            </div>
          </div>
          <div className={styles.stagingPane}>
            <div className={styles.stagingPaneHeader}>
              <span>Staged</span>
              <button className={styles.btn} onClick={unstageAll} disabled={staged.length === 0}>Unstage all</button>
            </div>
            <div className={styles.stagingList}>
              <StagingTree
                files={staged}
                side="staged"
                selectedPath={selectedFile?.path}
                selectedSource={selectedFile?.source}
                onSelect={(p) => selectWorkingFile(p, true)}
                onPrimaryAction={unstagePaths}
                emptyMessage="Nothing staged"
              />
            </div>
          </div>
          <div className={styles.stagingPane}>
            <div className={styles.stagingPaneHeader}>
              <span>Commit</span>
            </div>
            <div className={styles.commitBox}>
              <textarea
                className={styles.commitTextarea}
                placeholder="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
              <div className={styles.commitActions}>
                <label>
                  <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => {
                      setAmend(e.target.checked)
                      if (e.target.checked && commitMessage.trim().length === 0) {
                        prefillAmendMessage()
                      }
                    }}
                  />
                  Amend
                </label>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => commit()}
                  disabled={!canCommit}
                >
                  {amend ? 'Amend commit' : 'Commit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
