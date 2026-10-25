import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, api } from '../../services/api.ts'
import {
  buildUserEventText,
  matchesFromEvents,
  messagesFromEvents,
  readChatEvents,
  writeChatEvents,
  type ChatEvent,
} from '../../services/chatTurns.ts'
import { photoTarget, syncSituation, uploadIssuePhotos } from '../../services/situation.ts'
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
  const { user } = useAuth()
  const { draft, confirmed, applyConfirmedChanges, setSaved } = useIntakeDraft()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isResponding, setIsResponding] = useState(false)
  const eventsRef = useRef<ChatEvent[]>(readChatEvents())
  const [isRestoring, setIsRestoring] = useState(() => eventsRef.current.length > 0)
  const pendingReplyId = useRef<string | null>(null)
  const draftRef = useRef(draft)
  const confirmedRef = useRef(confirmed)

  useEffect(() => {
    draftRef.current = draft
    confirmedRef.current = confirmed
  }, [draft, confirmed])

  useEffect(() => {
    let current = true
    const stored = eventsRef.current
    if (stored.length === 0) return
    void messagesFromEvents(stored)
      .then((restored) => {
        if (current) setMessages(restored)
      })
      .finally(() => {
        if (current) setIsRestoring(false)
      })
    return () => {
      current = false
    }
  }, [])

  const userId = user?.id ?? null
  const previousUserId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (previousUserId.current === undefined) {
      previousUserId.current = userId
      return
    }
    if (previousUserId.current && previousUserId.current !== userId) {
      pendingReplyId.current = null
      eventsRef.current = []
      setMessages([])
      setIsResponding(false)
    }
    previousUserId.current = userId
  }, [userId])

  const sendMessage = useCallback(
    (text: string, images: ChatImage[] = []) => {
      const trimmedText = text.trim()
      if ((!trimmedText && images.length === 0) || pendingReplyId.current !== null) {
        return
      }

      const messageId = crypto.randomUUID()
      pendingReplyId.current = messageId
      const visibleText = trimmedText || 'Photo added'
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
          if (images.length > 0 && target) {
            await uploadIssuePhotos(target, images)
            storedPhotos = images.length
          }

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
            ),
          }
          const history = [...eventsRef.current, userEvent]
          eventsRef.current = history
          writeChatEvents(history)

          const response = await api<{ events: ChatEvent[] }>('/api/chat/turns/', {
            method: 'POST',
            body: { events: history },
          })
          if (pendingReplyId.current !== messageId) return

          const created = Array.isArray(response.events) ? response.events : []
          eventsRef.current = [...history, ...created]
          writeChatEvents(eventsRef.current)
          const { matchStatus, matches } = await matchesFromEvents(created)
          const replyText = created
            .flatMap((event) => (event.kind === 'message' && event.role === 'assistant' ? [event.text] : []))
            .join('\n\n')
            .trim()
          setMessages((current) => [
            ...current,
            {
              id: `${messageId}-reply`,
              role: 'assistant',
              text: replyText || (matches.length > 0
                ? 'Published experiences that matched your records are below.'
                : 'I don’t have a reply for that yet. Please try again.'),
              matchStatus: matches.length > 0 ? 'matched' : matchStatus,
              matches,
              followUps: [],
            },
          ])
        } catch (error) {
          if (pendingReplyId.current !== messageId) return
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
          if (pendingReplyId.current === messageId) {
            pendingReplyId.current = null
            setIsResponding(false)
          }
        }
      })()
    },
    [setSaved],
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
    pendingReplyId.current = null
    for (const message of messages) {
      if (message.role === 'user') {
        message.images.forEach((image) => URL.revokeObjectURL(image.url))
      }
    }
    eventsRef.current = []
    writeChatEvents([])
    setMessages([])
    setIsResponding(false)
  }, [messages])

  const value = useMemo(
    () => ({ messages, isResponding, isRestoring, sendMessage, confirmSuggestion, dismissSuggestion, resetChat }),
    [messages, isResponding, isRestoring, sendMessage, confirmSuggestion, dismissSuggestion, resetChat],
  )

  return <ChatContext value={value}>{children}</ChatContext>
}
