import clsx from 'clsx'
import { SessionSidebar } from './SessionSidebar'
import { BloomStage } from './BloomStage'
import { ChatPanel } from './ChatPanel'
import { SessionPrepModal } from './SessionPrepModal'
import { ExternalTranscriptView } from './ExternalTranscriptView'
import { useActiveListen } from '../../hooks/useActiveListen'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useViewStore } from '../../stores/useViewStore'
import { useChat } from '../../stores/useChat'
import styles from './ChatView.module.css'

export function ChatView(): JSX.Element {
  const isActive = useActiveListeningStore((s) => s.isActive)
  const rootPath = useProjectStore((s) => s.rootPath)
  useActiveListen({ enabled: isActive, projectPath: rootPath })
  const isChatFullWidth = useViewStore((s) => s.isChatFullWidth)
  const externalView = useChat((s) => s.externalView)
  return (
    <div className={clsx(styles.chatView, isChatFullWidth && styles.chatViewFullWidth)}>
      <SessionSidebar />
      {externalView ? (
        // Read-only External Session (Claude Code / Codex) replaces the live
        // conversation area; the sidebar stays for navigation.
        <ExternalTranscriptView transcript={externalView} />
      ) : (
        <>
          {!isChatFullWidth && <BloomStage />}
          <ChatPanel />
        </>
      )}
      <SessionPrepModal />
    </div>
  )
}
