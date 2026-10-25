import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint } from '../../styles/motion.ts'
import { ChatComposer } from './ChatComposer.tsx'
import { useChat, useLatestReply } from './ChatContext.ts'
import { ChatEmptyState } from './ChatEmptyState.tsx'
import { ChatHeader } from './ChatHeader.tsx'
import { AssistantMessage, UserMessage } from './ChatMessages.tsx'
import { TypingIndicator } from './TypingIndicator.tsx'

const messageTransition = { duration: 0.35, ease: easeOutQuint }

export function ChatPage() {
  const { messages, isResponding, sendMessage, confirmSuggestion, dismissSuggestion, resetChat } = useChat()
  const latestReply = useLatestReply()
  const shouldReduceMotion = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const setFadeElement = useScrollFade<HTMLDivElement>()
  const setScrollElement = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      setFadeElement(node)
    },
    [setFadeElement],
  )

  const hasMessages = messages.length > 0

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !hasMessages) {
      return
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
    })
  }, [messages.length, isResponding, hasMessages, shouldReduceMotion])

  function sendSuggestion(text: string) {
    sendMessage(text)
    textareaRef.current?.focus()
  }

  function handleReset() {
    resetChat()
    textareaRef.current?.focus()
  }

  return (
    <motion.section
      aria-labelledby="chat-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={messageTransition}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-text/[0.06] bg-surface shadow-card"
    >
      <ChatHeader hasMessages={hasMessages} onReset={handleReset} />

      <div
        ref={setScrollElement}
        className="scroll-fade-y relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8"
      >
        {hasMessages ? (
          <ol
            aria-label="Conversation"
            aria-live="polite"
            aria-relevant="additions"
            className="mx-auto flex max-w-2xl flex-col gap-6"
          >
            {messages.map((message) => (
              <motion.li
                key={message.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={messageTransition}
              >
                {message.role === 'user' ? (
                  <UserMessage
                    text={message.text}
                    images={message.images}
                    suggestions={message.suggestions}
                    onConfirmSuggestion={(suggestionId) => confirmSuggestion(message.id, suggestionId)}
                    onDismissSuggestion={(suggestionId) => dismissSuggestion(message.id, suggestionId)}
                  />
                ) : (
                  <AssistantMessage
                    message={message}
                    isLatest={message.id === latestReply?.id}
                    showFollowUps={message.id === latestReply?.id && !isResponding}
                    onFollowUp={sendSuggestion}
                  />
                )}
              </motion.li>
            ))}
            {isResponding && (
              <motion.li
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={messageTransition}
              >
                <TypingIndicator />
              </motion.li>
            )}
          </ol>
        ) : (
          <ChatEmptyState onSelectExample={sendSuggestion} />
        )}
      </div>

      <ChatComposer isResponding={isResponding} onSend={sendMessage} textareaRef={textareaRef} />
    </motion.section>
  )
}
