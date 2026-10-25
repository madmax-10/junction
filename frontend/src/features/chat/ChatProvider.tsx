import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, api } from '../../services/api.ts'
import {
  buildUserEventText,
  discardLegacyChatEvents,
  matchesFromEvents,
  messagesFromEvents,
  postFromEvents,
  readChatEvents,
  repairOutcomeFromEvents,
  replyText,
  writeChatEvents,
  type ChatEvent,
} from '../../services/chatTurns.ts'
import { photoTarget, syncSituation, uploadChatPhotos, uploadIssuePhotos } from '../../services/situation.ts'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'
import type { DetailSuggestion, SuggestionStatus } from '../../types/extraction.ts'
import { getDetailChanges, isDetailSaved } from '../intake/extractedDetails.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { getVehicleName } from '../intake/intakeHighlights.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { ChatContext } from './ChatContext.ts'

function updateSuggestions(
  messages: ChatMessage[],
  messageId: string,
  update: (suggestions: DetailSuggestion[]) => DetailSuggestion[],
) {
  return messages.map((message) =>
    message.id === messageId && message.role === 'user'
      ? { ...message, suggestions: update(message.suggestions) }
      : message,
  )
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isReady } = useAuth()
  const userId = user?.id ?? null
  const { draft, confirmed, applyConfirmedChanges, setSaved } = useIntakeDraft()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isResponding, setIsResponding] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [trackedUserId, setTrackedUserId] = useState<string | null | undefined>(undefined)
  const eventsRef = useRef<ChatEvent[]>([])
  const pendingReplyId = useRef<string | null>(null)
  const sessionRef = useRef(0)
  const appliedUserId = useRef<string | null | undefined>(undefined)
  const draftRef = useRef(draft)
  const confirmedRef = useRef(confirmed)

  if (isReady && trackedUserId !== userId) {
    const stored = userId ? readChatEvents(userId) : []
    setTrackedUserId(userId)
    setMessages([])
    setIsResponding(false)
    setIsRestoring(stored.length > 0)
  }

  useEffect(() => {
    draftRef.current = draft
    confirmedRef.current = confirmed
  }, [draft, confirmed])

  useLayoutEffect(() => {
    if (!isReady || appliedUserId.current === userId) return
    appliedUserId.current = userId
    sessionRef.current += 1
    pendingReplyId.current = null
    discardLegacyChatEvents()
    eventsRef.current = userId ? readChatEvents(userId) : []
  }, [isReady, userId])

  useEffect(() => {
    if (!isReady || !userId || eventsRef.current.length === 0) return
    const session = sessionRef.current
    const stored = eventsRef.current
    let current = true
    void messagesFromEvents(stored)
      .then((restored) => {
        if (current && sessionRef.current === session) setMessages(restored)
      })
      .finally(() => {
        if (current && sessionRef.current === session) setIsRestoring(false)
      })
    return () => {
      current = false
    }
  }, [isReady, userId])

  const sendMessage = useCallback(
    (text: string, images: ChatImage[] = [], hiddenNote?: string) => {
      const trimmedText = text.trim()
      const ownerId = userId
      const session = sessionRef.current
      if (!ownerId || (!trimmedText && images.length === 0) || pendingReplyId.current !== null) {
        return
      }

      const messageId = crypto.randomUUID()
      pendingReplyId.current = messageId
      const visibleText = trimmedText || 'Photo added'
      const stillCurrent = () => sessionRef.current === session && pendingReplyId.current === messageId
      setMessages((current) => [
        ...current,
        { id: messageId, role: 'user', text: visibleText, images, suggestions: [] },
      ])
      setIsResponding(true)

      void (async () => {
        try {
          const nextSaved = await syncSituation(draftRef.current)
          setSaved(nextSaved)
          const suggestions: DetailSuggestion[] = nextSaved.details
            .filter((detail) => !isDetailSaved(detail, draftRef.current, confirmedRef.current))
            .map((detail) => ({ ...detail, id: `${messageId}-${detail.field}`, status: 'pending' as const }))
          if (suggestions.length > 0) {
            setMessages((current) => updateSuggestions(current, messageId, () => suggestions))
          }

          const target = photoTarget(nextSaved)
          let storedPhotos = 0
          const photoNotes: string[] = []
          if (images.length > 0) {
            if (target) {
              await uploadIssuePhotos(target, images)
              storedPhotos = images.length
            }
            const chatPhotos = await uploadChatPhotos(images)
            if (chatPhotos.length > 0) {
              photoNotes.push(`photo image_ids (read with read_image): ${chatPhotos.join(', ')}`)
            }
          }

          if (!stillCurrent()) return

          const isFirst = eventsRef.current.length === 0
          const userEvent: ChatEvent = {
            id: messageId,
            kind: 'message',
            role: 'user',
            author: 'user',
            text: buildUserEventText(
              visibleText,
              storedPhotos,
              nextSaved,
              getVehicleName(draftRef.current.vehicle),
              isFirst,
              [...photoNotes, ...(hiddenNote ? [hiddenNote] : [])],
            ),
          }
          const history = [...eventsRef.current, userEvent]
          eventsRef.current = history
          writeChatEvents(ownerId, history)

          const response = await api<{ events: ChatEvent[] }>('/api/chat/turns/', {
            method: 'POST',
            body: { events: history },
          })
          if (!stillCurrent()) return

          const created = Array.isArray(response.events) ? response.events : []
          eventsRef.current = [...history, ...created]
          writeChatEvents(ownerId, eventsRef.current)
          const { matchStatus, matches } = await matchesFromEvents(created)
          if (!stillCurrent()) return
          const post = postFromEvents(created)
          const repairOutcome = post ? undefined : repairOutcomeFromEvents(created)
          const replies = created.flatMap((event) =>
            event.kind === 'message' && event.role === 'assistant' ? [event.text] : [],
          )
          setMessages((current) => [
            ...current,
            {
              id: `${messageId}-reply`,
              role: 'assistant',
              text: replyText(replies, matches.length, post),
              matchStatus: matches.length > 0 ? 'matched' : matchStatus,
              matches,
              followUps: [],
              ...(post ? { post } : {}),
              ...(repairOutcome ? { repairOutcome } : {}),
            },
          ])
        } catch (error) {
          if (!stillCurrent()) return
          const message = error instanceof ApiError
            ? error.message
            : 'Something went wrong. Please try again.'
          setMessages((current) => [
            ...current,
            {
              id: `${messageId}-reply`,
              role: 'assistant',
              text: message,
              matchStatus: 'unavailable',
              matches: [],
              followUps: [],
            },
          ])
        } finally {
          if (sessionRef.current === session && pendingReplyId.current === messageId) {
            pendingReplyId.current = null
            setIsResponding(false)
          }
        }
      })()
    },
    [setSaved, userId],
  )

  const setSuggestionStatus = useCallback(
    (messageId: string, suggestionId: string, status: SuggestionStatus) => {
      setMessages((current) =>
        updateSuggestions(current, messageId, (suggestions) =>
          suggestions.map((suggestion) => (suggestion.id === suggestionId ? { ...suggestion, status } : suggestion)),
        ),
      )
    },
    [],
  )

  const confirmSuggestion = useCallback(
    (messageId: string, suggestionId: string) => {
      const message = messages.find((item) => item.id === messageId)
      const suggestion =
        message?.role === 'user' ? message.suggestions.find((item) => item.id === suggestionId) : undefined
      if (suggestion?.status !== 'pending') {
        return
      }
      applyConfirmedChanges(getDetailChanges(suggestion))
      setSuggestionStatus(messageId, suggestionId, 'confirmed')
    },
    [messages, applyConfirmedChanges, setSuggestionStatus],
  )

  const dismissSuggestion = useCallback(
    (messageId: string, suggestionId: string) => setSuggestionStatus(messageId, suggestionId, 'dismissed'),
    [setSuggestionStatus],
  )

  const resetChat = useCallback(() => {
    const ownerId = userId
    sessionRef.current += 1
    pendingReplyId.current = null
    for (const message of messages) {
      if (message.role === 'user') {
        message.images.forEach((image) => URL.revokeObjectURL(image.url))
      }
    }
    eventsRef.current = []
    if (ownerId) writeChatEvents(ownerId, [])
    setMessages([])
    setIsResponding(false)
  }, [messages, userId])

  const value = useMemo(
    () => ({ messages, isResponding, isRestoring, sendMessage, confirmSuggestion, dismissSuggestion, resetChat }),
    [messages, isResponding, isRestoring, sendMessage, confirmSuggestion, dismissSuggestion, resetChat],
  )

  return <ChatContext value={value}>{children}</ChatContext>
}
