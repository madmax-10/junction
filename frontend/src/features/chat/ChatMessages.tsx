import type { ChatImage, ChatMessage } from '../../types/chat.ts'
import type { DetailSuggestion } from '../../types/extraction.ts'
import { FollowUpChips } from './FollowUpChips.tsx'
import { GuideAvatar } from './GuideAvatar.tsx'
import { NoStoryMatches, StoryMatchList } from './StoryMatchList.tsx'
import { SuggestionChips } from './SuggestionChips.tsx'

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
                className="size-24 rounded-2xl border border-text/[0.06] object-cover shadow-card sm:size-28"
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
  onFollowUp: (question: string) => void
}

export function AssistantMessage({ message, isLatest, showFollowUps, onFollowUp }: AssistantMessageProps) {
  const paragraphs = message.text.split('\n\n')

  return (
    <div className="flex items-start gap-3">
      <GuideAvatar />
      <div className="min-w-0 flex-1">
        <span className="sr-only">Guide said:</span>
        <div className="max-w-xl space-y-3 rounded-3xl rounded-tl-lg bg-background px-4 py-3 font-body text-[0.95rem] leading-relaxed">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {message.matchStatus === 'matched' && (
          <StoryMatchList id={`${message.id}-matches`} matches={message.matches} isLatest={isLatest} />
        )}
        {message.matchStatus === 'no-match' && <NoStoryMatches />}

        {showFollowUps && message.followUps.length > 0 && (
          <FollowUpChips questions={message.followUps} onSelect={onFollowUp} />
        )}
      </div>
    </div>
  )
}
