import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createMockReply } from '../../mocks/mockChatReplies.ts'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { getVehicleName } from '../intake/intakeHighlights.ts'
import { ChatContext } from './ChatContext.ts'

let messageCount = 0

function createMessageId(role: ChatMessage['role']) {
  messageCount += 1
  return `${role}-${messageCount}`
}

function getReplyDelay(text: string) {
  return 900 + Math.min(text.length * 6, 900)
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { draft } = useIntakeDraft()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isResponding, setIsResponding] = useState(false)
  const replyTimer = useRef<number | null>(null)

  const vehicleName = getVehicleName(draft.vehicle)
  const hasReplied = messages.some((message) => message.role === 'assistant')

  useEffect(() => {
    return () => {
      if (replyTimer.current !== null) {
        window.clearTimeout(replyTimer.current)
      }
    }
  }, [])

  const sendMessage = useCallback(
    (text: string, images: ChatImage[] = []) => {
      const trimmedText = text.trim()
      if ((!trimmedText && images.length === 0) || replyTimer.current !== null) {
        return
      }

      setMessages((current) => [
        ...current,
        { id: createMessageId('user'), role: 'user', text: trimmedText, images },
      ])
      setIsResponding(true)

      const reply = createMockReply({
        text: trimmedText,
        imageCount: images.length,
        isFirstReply: !hasReplied,
        vehicleName,
      })

      replyTimer.current = window.setTimeout(() => {
        replyTimer.current = null
        setMessages((current) => [
          ...current,
          { id: createMessageId('assistant'), role: 'assistant', ...reply },
        ])
        setIsResponding(false)
      }, getReplyDelay(trimmedText))
    },
    [hasReplied, vehicleName],
  )

  const resetChat = useCallback(() => {
    if (replyTimer.current !== null) {
      window.clearTimeout(replyTimer.current)
      replyTimer.current = null
    }
    for (const message of messages) {
      if (message.role === 'user') {
        message.images.forEach((image) => URL.revokeObjectURL(image.url))
      }
    }
    setMessages([])
    setIsResponding(false)
  }, [messages])

  const value = useMemo(
    () => ({ messages, isResponding, sendMessage, resetChat }),
    [messages, isResponding, sendMessage, resetChat],
  )

  return <ChatContext value={value}>{children}</ChatContext>
}
