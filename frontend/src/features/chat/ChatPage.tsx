import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { SiteHeader } from '../../components/layout/SiteHeader.tsx'
import { easeOutQuint } from '../../styles/motion.ts'
import type { ChatMessage } from '../../types/chat.ts'
import { ChatComposer } from './ChatComposer.tsx'
import { useChat } from './ChatContext.ts'
import { ChatEmptyState } from './ChatEmptyState.tsx'
import { ChatHeader } from './ChatHeader.tsx'
import { AssistantMessage, UserMessage } from './ChatMessages.tsx'
import { ExperiencePanel } from './ExperiencePanel.tsx'
import { TypingIndicator } from './TypingIndicator.tsx'

const messageTransition = { duration: 0.35, ease: easeOutQuint }

type AssistantChatMessage = Extract<ChatMessage, { role: 'assistant' }>

export function ChatPage() {
  const { messages, isResponding, sendMessage, resetChat } = useChat()
  const shouldReduceMotion = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasMessages = messages.length > 0
  const latestReply = messages.findLast(
    (message): message is AssistantChatMessage => message.role === 'assistant',
  )

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
    <div className="flex h-svh flex-col bg-background text-text">
      <SiteHeader />

      <main className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-rows-[minmax(0,1fr)] gap-6 px-3 pb-3 sm:px-8 sm:pb-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <motion.section
          aria-labelledby="chat-title"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={messageTransition}
          className="flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-text/[0.06] bg-surface shadow-card"
        >
          <ChatHeader hasMessages={hasMessages} onReset={handleReset} />

          <div
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8"
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
                      <UserMessage text={message.text} images={message.images} />
                    ) : (
                      <AssistantMessage
                        message={message}
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

        <ExperiencePanel
          stories={latestReply?.stories ?? []}
          resultsKey={latestReply?.id ?? null}
          isSearching={isResponding}
        />
      </main>
    </div>
  )
}
