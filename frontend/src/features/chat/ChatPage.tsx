import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint } from '../../styles/motion.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import type { WorkspaceOutletContext } from '../workspace/WorkspaceLayout.tsx'
import { ChatComposer } from './ChatComposer.tsx'
import { useChat, useLatestReply } from './ChatContext.ts'
import { ChatDetailsPrompt } from './ChatDetailsPrompt.tsx'
import { ChatEmptyState } from './ChatEmptyState.tsx'
import { ChatHeader } from './ChatHeader.tsx'
import { AssistantMessage, UserMessage } from './ChatMessages.tsx'
import { buildStartingMessage, hasStartingDetails } from './startingDetails.ts'
import { TypingIndicator } from './TypingIndicator.tsx'

const messageTransition = { duration: 0.35, ease: easeOutQuint }

export function ChatPage() {
  const { messages, isResponding, isRestoring, sendMessage, confirmSuggestion, dismissSuggestion, resetChat } =
    useChat()
  const { draft, resetDraft } = useIntakeDraft()
  const { openEditor } = useOutletContext<WorkspaceOutletContext>()
  const latestReply = useLatestReply()
  const shouldReduceMotion = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const setFadeElement = useScrollFade<HTMLDivElement>()
  const setScrollElement = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      setFadeElement(node)
    },
    [setFadeElement],
  )

  const hasMessages = messages.length > 0
  const isReadyToStart = hasStartingDetails(draft)
  const needsDetails = !hasMessages && !isRestoring && !isReadyToStart

  // A new conversation opens with the saved situation, so the first reply is based on those details.
  useEffect(() => {
    if (hasMessages || isRestoring || isResponding || !isReadyToStart) return
    sendMessage(buildStartingMessage(draft))
  }, [hasMessages, isRestoring, isResponding, isReadyToStart, draft, sendMessage])

  // The composer floats over the conversation, so reserve its height at the end of the scroll area.
  useLayoutEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    const observer = new ResizeObserver(() => setComposerHeight(composer.offsetHeight))
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

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
    resetDraft()
  }

  return (
    <motion.section
      aria-labelledby="chat-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={messageTransition}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-card"
    >
      <ChatHeader hasMessages={hasMessages} onReset={handleReset} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={setScrollElement}
          style={{ paddingBottom: composerHeight + 8 }}
          className="scroll-fade-y relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-6 sm:px-8 sm:pt-8"
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
          ) : needsDetails ? (
            <ChatDetailsPrompt onEdit={openEditor} />
          ) : (
            <ChatEmptyState onSelectExample={sendSuggestion} />
          )}
        </div>

        <div ref={composerRef} className="pointer-events-none absolute inset-x-0 bottom-0">
          <ChatComposer
            isResponding={isResponding}
            disabled={needsDetails}
            onSend={sendMessage}
            textareaRef={textareaRef}
          />
        </div>
      </div>
    </motion.section>
  )
}
