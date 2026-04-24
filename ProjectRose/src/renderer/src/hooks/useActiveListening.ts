import { useEffect, useRef } from 'react'
import { useActiveListeningStore } from '../stores/useActiveListeningStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useChatStore } from '../stores/useChatStore'
import { useAudioStream } from './useAudioStream'

export function useActiveListening(): void {
  const isActive = useActiveListeningStore((s) => s.isActive)
  const sessionId = useActiveListeningStore((s) => s.sessionId)
  const isDrafting = useActiveListeningStore((s) => s.isDrafting)
  const draftText = useActiveListeningStore((s) => s.draftText)
  const rootPath = useProjectStore((s) => s.rootPath)
  const agentName = useSettingsStore((s) => s.agentName)
  const userName = useSettingsStore((s) => s.userName)

  // Keep mutable refs so utterance handler always has fresh values
  const isDraftingRef = useRef(isDrafting)
  const draftTextRef = useRef(draftText)
  const agentNameRef = useRef(agentName)
  const userNameRef = useRef(userName)
  isDraftingRef.current = isDrafting
  draftTextRef.current = draftText
  agentNameRef.current = agentName
  userNameRef.current = userName

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useAudioStream({ enabled: isActive, sessionId, projectPath: rootPath })

  useEffect(() => {
    if (!isActive || !rootPath) return

    const store = useActiveListeningStore.getState()
    let mounted = true
    let capturedSessionId: number | null = null
    let utteranceCleanup: (() => void) | null = null

    const clearTimer = (): void => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
      store.setDraftSecondsLeft(null)
    }

    const startTimer = (): void => {
      clearTimer()
      let count = 8
      store.setDraftSecondsLeft(count)
      tickRef.current = setInterval(() => {
        count--
        store.setDraftSecondsLeft(count > 0 ? count : null)
      }, 1000)
      timerRef.current = setTimeout(() => {
        if (!mounted) return
        clearTimer()
        const text = draftTextRef.current.trim()
        if (text) {
          useChatStore.getState().setInputValue(text)
          useChatStore.getState().sendMessage()
        }
        useActiveListeningStore.getState().completeDraft()
      }, 8000)
    }

    ;(async () => {
      try {
        const { id } = await window.api.activeSpeech.createSession({ projectPath: rootPath })
        if (!mounted) return
        capturedSessionId = id
        store.setSessionId(id)

        await window.api.activeSpeech.startStream({ sessionId: id, projectPath: rootPath })
        if (!mounted) return

        const speakers = await window.api.activeSpeech.getSpeakers(rootPath)
        if (mounted) store.setSpeakers(speakers)

        utteranceCleanup = window.api.activeSpeech.onUtterance((evt) => {
          if (!mounted || evt.sessionId !== id) return

          store.addUtterance({
            utteranceId: evt.utterance_id,
            speakerName: evt.speaker_name,
            text: evt.text,
            timestamp: Date.now()
          })

          const uName = userNameRef.current
          const isUser = uName
            ? evt.speaker_name?.toLowerCase() === uName.toLowerCase()
            : true

          const aName = agentNameRef.current
          const hasWakeWord = Boolean(aName) && evt.text.toLowerCase().includes(aName.toLowerCase())

          if (!isDraftingRef.current && isUser && hasWakeWord) {
            store.startDraft(evt.text)
            startTimer()
          } else if (isDraftingRef.current && isUser) {
            store.appendDraft(evt.text)
            startTimer()
          }
        })
      } catch {
        // session creation or stream start failed silently
      }
    })()

    return () => {
      mounted = false
      utteranceCleanup?.()
      clearTimer()
      useActiveListeningStore.getState().cancelDraft()
      const sid = capturedSessionId
      if (sid !== null) {
        window.api.activeSpeech.stopStream({ sessionId: sid }).catch(() => {})
        window.api.activeSpeech.endSession({ sessionId: sid, projectPath: rootPath }).catch(() => {})
      }
      useActiveListeningStore.getState().setSessionId(null)
    }
  }, [isActive, rootPath]) // eslint-disable-line react-hooks/exhaustive-deps
}
