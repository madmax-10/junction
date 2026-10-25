import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createMockReply } from '../../mocks/mockChatReplies.ts'
import { extractSituationDetails } from '../../services/situationExtraction.ts'
import { findSimilarStories } from '../../services/storyMatching.ts'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'
import type { DetailSuggestion, SuggestionStatus } from '../../types/extraction.ts'
import type { StoryMatch, StoryMatchQuery, StoryMatchStatus } from '../../types/story.ts'
import { getDetailChanges, isDetailSaved } from '../intake/extractedDetails.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { getVehicleName } from '../intake/intakeHighlights.ts'
import { ChatContext } from './ChatContext.ts'

let messageCount = 0

const matchLimit = 3

type StorySearch = { matchStatus: StoryMatchStatus; matches: StoryMatch[] }

function createMessageId(role: ChatMessage['role']) {
  messageCount += 1
  return `${role}-${messageCount}`
}

function getReplyDelay(text: string) {
  return 900 + Math.min(text.length * 6, 900)
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

async function searchStories(query: StoryMatchQuery): Promise<StorySearch> {
  try {
    const matches = await findSimilarStories(query)
    return { matchStatus: matches.length > 0 ? 'matched' : 'no-match', matches }
  } catch {
    return { matchStatus: 'unavailable', matches: [] }
  }
}

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
  const { draft, confirmed, applyConfirmedChanges } = useIntakeDraft()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isResponding, setIsResponding] = useState(false)
  const pendingReplyId = useRef<string | null>(null)

  const vehicleName = getVehicleName(draft.vehicle)
  const hasReplied = messages.some((message) => message.role === 'assistant')

  useEffect(() => {
    return () => {
      pendingReplyId.current = null
    }
  }, [])

  const sendMessage = useCallback(
    (text: string, images: ChatImage[] = []) => {
      const trimmedText = text.trim()
      if ((!trimmedText && images.length === 0) || pendingReplyId.current !== null) {
        return
      }

      const messageId = createMessageId('user')
      pendingReplyId.current = messageId
      setMessages((current) => [
        ...current,
        { id: messageId, role: 'user', text: trimmedText, images, suggestions: [] },
      ])
      setIsResponding(true)

      if (trimmedText) {
        void extractSituationDetails(trimmedText).then((details) => {
          const suggestions: DetailSuggestion[] = details
            .filter((detail) => !isDetailSaved(detail, draft, confirmed))
            .map((detail) => ({ ...detail, id: `${messageId}-${detail.field}`, status: 'pending' }))
          if (suggestions.length > 0) {
            setMessages((current) => updateSuggestions(current, messageId, () => suggestions))
          }
        })
      }

      void Promise.all([
        searchStories({ message: trimmedText, situation: draft, limit: matchLimit }),
        wait(getReplyDelay(trimmedText)),
      ]).then(([{ matchStatus, matches }]) => {
        if (pendingReplyId.current !== messageId) {
          return
        }
        pendingReplyId.current = null

        const reply = createMockReply({
          text: trimmedText,
          imageCount: images.length,
          isFirstReply: !hasReplied,
          vehicleName,
          matchStatus,
          matchCount: matches.length,
        })
        setMessages((current) => [
          ...current,
          { id: createMessageId('assistant'), role: 'assistant', ...reply, matchStatus, matches },
        ])
        setIsResponding(false)
      })
    },
    [hasReplied, vehicleName, draft, confirmed],
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
    setMessages([])
    setIsResponding(false)
  }, [messages])

  const value = useMemo(
    () => ({ messages, isResponding, sendMessage, confirmSuggestion, dismissSuggestion, resetChat }),
    [messages, isResponding, sendMessage, confirmSuggestion, dismissSuggestion, resetChat],
  )

  return <ChatContext value={value}>{children}</ChatContext>
}
