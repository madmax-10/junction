import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint } from '../../styles/motion.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import type { RepairOutcomePrompt } from '../../types/repair.ts'
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
  const { draft, saved, resetDraft } = useIntakeDraft()
  const [repairShareAnchor, setRepairShareAnchor] = useState<string | null>(null)
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

  // A draft can come back over several turns, so only its newest message shows the review card.
  const latestPostMessage = new Map<string, string>()
  // Once a repair has a post card, its review card takes over from the "share this repair" card.
  const lastRepairPostIndex = new Map<string, number>()
  const latestOutcomeMessage = new Map<string, string>()
  messages.forEach((message, index) => {
    if (message.role !== 'assistant') return
    if (message.post) {
      latestPostMessage.set(message.post.id, message.id)
      if (message.post.issueType === 'repair') lastRepairPostIndex.set(message.post.issueId, index)
    }
    if (message.repairOutcome) latestOutcomeMessage.set(message.repairOutcome.issueId, message.id)
  })

  const repairIssueId = saved.issues.repair ?? null
  const canOfferRepairShare =
    repairIssueId !== null &&
    repairShareAnchor === null &&
    !latestOutcomeMessage.has(repairIssueId) &&
    !lastRepairPostIndex.has(repairIssueId)

  function repairOutcomeFor(message: (typeof messages)[number], index: number): RepairOutcomePrompt | undefined {
    if (message.role !== 'assistant') return undefined
    const prompt =
      message.repairOutcome && latestOutcomeMessage.get(message.repairOutcome.issueId) === message.id
        ? message.repairOutcome
        : message.id === repairShareAnchor && repairIssueId
          ? { issueId: repairIssueId }
          : undefined
    if (!prompt) return undefined
    return (lastRepairPostIndex.get(prompt.issueId) ?? -1) < index ? prompt : undefined
  }

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
    setRepairShareAnchor(null)
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
              {messages.map((message, index) => (
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
                      showPost={message.post ? latestPostMessage.get(message.post.id) === message.id : false}
                      repairOutcome={repairOutcomeFor(message, index)}
                      onShareRepair={
                        canOfferRepairShare && message.id === latestReply?.id && !isResponding
                          ? () => setRepairShareAnchor(message.id)
                          : undefined
                      }
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
