import { Wrench } from '@phosphor-icons/react'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'
import type { DetailSuggestion } from '../../types/extraction.ts'
import type { RepairOutcomePrompt } from '../../types/repair.ts'
import { FollowUpChips } from './FollowUpChips.tsx'
import { GuideAvatar } from './GuideAvatar.tsx'
import { PostReviewCard } from './PostReviewCard.tsx'
import { RepairOutcomeCard } from './RepairOutcomeCard.tsx'
import { NoStoryMatches, StoryMatchList } from './StoryMatchList.tsx'
import { SuggestionChips } from './SuggestionChips.tsx'

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

type UserMessageProps = {
  text: string
  images: ChatImage[]
  suggestions: DetailSuggestion[]
  onConfirmSuggestion: (suggestionId: string) => void
  onDismissSuggestion: (suggestionId: string) => void
}

export function UserMessage({
  text,
  images,
  suggestions,
  onConfirmSuggestion,
  onDismissSuggestion,
}: UserMessageProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <span className="sr-only">You said:</span>
      {images.length > 0 && (
        <ul className="flex max-w-[85%] flex-wrap justify-end gap-2 sm:max-w-[75%]">
          {images.map((image, index) => (
            <li key={image.id}>
              <img
                src={image.url}
                alt={`Your photo ${index + 1} of ${images.length}`}
                className="size-24 rounded-2xl border border-border object-cover shadow-card sm:size-28"
              />
            </li>
          ))}
        </ul>
      )}
      {text && (
        <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-3 font-body text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap text-surface sm:max-w-[75%]">
          {text}
        </p>
      )}
      {suggestions.length > 0 && (
        <SuggestionChips
          suggestions={suggestions}
          onConfirm={onConfirmSuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}
    </div>
  )
}

type AssistantMessageProps = {
  message: Extract<ChatMessage, { role: 'assistant' }>
  isLatest: boolean
  showFollowUps: boolean
  showPost: boolean
  repairOutcome?: RepairOutcomePrompt
  onShareRepair?: () => void
  onFollowUp: (question: string) => void
}

export function AssistantMessage({
  message,
  isLatest,
  showFollowUps,
  showPost,
  repairOutcome,
  onShareRepair,
  onFollowUp,
}: AssistantMessageProps) {
  const paragraphs = message.text.split('\n\n')

  return (
    <div className="flex items-start gap-3">
      <GuideAvatar />
      <div className="min-w-0 flex-1">
        <span className="sr-only">Guide said:</span>
        <div className="max-w-xl space-y-3 rounded-3xl rounded-tl-lg bg-secondary-light px-4 py-3 font-body text-[0.95rem] leading-relaxed">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="whitespace-pre-line">
              {renderInline(paragraph)}
            </p>
          ))}
        </div>

        {message.matchStatus === 'matched' && message.matches.length > 0 && (
          <StoryMatchList id={`${message.id}-matches`} matches={message.matches} isLatest={isLatest} />
        )}
        {message.matchStatus === 'no-match' && <NoStoryMatches />}

        {showPost && message.post && <PostReviewCard key={message.post.id} initialPost={message.post} />}
        {repairOutcome && <RepairOutcomeCard key={repairOutcome.issueId} prompt={repairOutcome} />}
        {onShareRepair && (
          <button
            type="button"
            onClick={onShareRepair}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-secondary/20 bg-surface px-3 py-1.5 font-body text-xs font-semibold text-secondary transition-colors duration-200 outline-none hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary"
          >
            <Wrench size={14} weight="duotone" aria-hidden="true" />
            Got it fixed? Share your repair story
          </button>
        )}

        {showFollowUps && message.followUps.length > 0 && (
          <FollowUpChips questions={message.followUps} onSelect={onFollowUp} />
        )}
      </div>
    </div>
  )
}
