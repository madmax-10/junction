import { UsersThree } from '@phosphor-icons/react'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'
import { StoryPreviewCard } from '../stories/StoryPreviewCard.tsx'
import { FollowUpChips } from './FollowUpChips.tsx'
import { GuideAvatar } from './GuideAvatar.tsx'

type UserMessageProps = {
  text: string
  images: ChatImage[]
}

export function UserMessage({ text, images }: UserMessageProps) {
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
    </div>
  )
}

type AssistantMessageProps = {
  message: Extract<ChatMessage, { role: 'assistant' }>
  showFollowUps: boolean
  onFollowUp: (question: string) => void
}

export function AssistantMessage({ message, showFollowUps, onFollowUp }: AssistantMessageProps) {
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

        {message.stories.length > 0 && (
          <section aria-label="Similar experiences" className="mt-3 lg:hidden">
            <p className="flex items-center gap-1.5 font-body text-xs font-medium text-text/60">
              <UsersThree size={16} className="text-primary" aria-hidden="true" />
              {message.stories.length} similar experiences
            </p>
            <ul className="mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
              {message.stories.map((story) => (
                <li key={story.id} className="w-[16.5rem] shrink-0 snap-start">
                  <StoryPreviewCard story={story} variant="compact" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {showFollowUps && message.followUps.length > 0 && (
          <FollowUpChips questions={message.followUps} onSelect={onFollowUp} />
        )}
      </div>
    </div>
  )
}
