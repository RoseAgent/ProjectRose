import clsx from 'clsx'
import { SessionSidebar } from './SessionSidebar'
import { BloomStage } from './BloomStage'
import { ChatPanel } from './ChatPanel'
import { SessionPrepModal } from './SessionPrepModal'
import { useActiveListen } from '../../hooks/useActiveListen'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useViewStore } from '../../stores/useViewStore'
import styles from './ChatView.module.css'

export function ChatView(): JSX.Element {
  const isActive = useActiveListeningStore((s) => s.isActive)
  const rootPath = useProjectStore((s) => s.rootPath)
  useActiveListen({ enabled: isActive, projectPath: rootPath })
  const isChatFullWidth = useViewStore((s) => s.isChatFullWidth)
  const activeView = useViewStore((s) => s.activeView)
  return (
    <div className={clsx(styles.chatView, isChatFullWidth && styles.chatViewFullWidth)}>
      <SessionSidebar />
      {!isChatFullWidth && <BloomStage />}
      {/* ChatView stays mounted while the editor is showing, so only claim
          the TTS/compression singletons when chat is actually the active
          view (the editor rail owns them otherwise). */}
      <ChatPanel primary={activeView === 'chat'} />
      <SessionPrepModal />
    </div>
  )
}
