import { ArrowCounterClockwise, CheckCircle, ListChecks } from '@phosphor-icons/react'
import { paths } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { ButtonLink } from '../../components/ui/ButtonLink.tsx'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { getIntakeHighlights } from '../intake/intakeHighlights.ts'
import { GuideAvatar } from './GuideAvatar.tsx'

type ChatHeaderProps = {
  hasMessages: boolean
  onReset: () => void
}

export function ChatHeader({ hasMessages, onReset }: ChatHeaderProps) {
  const { draft } = useIntakeDraft()
  const highlights = getIntakeHighlights(draft)
  const hasDetails = highlights.length > 0

  return (
    <header className="border-b border-text/[0.06]">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <GuideAvatar size="md" />
          <div className="min-w-0">
            <h1 id="chat-title" className="font-heading text-base font-bold tracking-tight">
              Experience guide
            </h1>
            <p className="truncate font-body text-xs text-text/60">Preview · replies are simulated</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasMessages && (
            <Button variant="secondary" onClick={onReset}>
              <ArrowCounterClockwise size={16} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only lg:sr-only xl:not-sr-only">New chat</span>
            </Button>
          )}
          <ButtonLink to={paths.intake} variant="secondary">
            <ListChecks size={16} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{hasDetails ? 'Edit details' : 'Add details'}</span>
          </ButtonLink>
        </div>
      </div>

      {hasDetails && (
        <div className="flex items-start gap-2 border-t border-text/[0.06] bg-primary-light/50 px-4 py-2.5 font-body text-xs sm:items-center sm:px-6">
          <CheckCircle size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0">
            <span className="text-text/65">Using details you added: </span>
            <span className="font-medium">{highlights.join(' · ')}</span>
          </p>
        </div>
      )}
    </header>
  )
}
