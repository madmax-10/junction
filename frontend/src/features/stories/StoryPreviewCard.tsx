import { Car, CheckCircle } from '@phosphor-icons/react'
import { Badge } from '../../components/ui/Badge.tsx'
import type { StoryPreview } from '../../types/story.ts'

type StoryPreviewCardProps = {
  story: StoryPreview
  variant?: 'full' | 'compact'
}

export function StoryPreviewCard({ story, variant = 'full' }: StoryPreviewCardProps) {
  const isCompact = variant === 'compact'

  return (
    <article
      className={`relative rounded-2xl border border-text/[0.06] bg-surface shadow-card transition-shadow duration-300 ease-out hover:shadow-card-hover ${isCompact ? 'px-5 py-4' : 'p-5'}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold leading-snug tracking-tight">
            {story.title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-text/70">
            <Car size={16} className="shrink-0 text-primary" aria-hidden="true" />
            {story.vehicle}
          </p>
        </div>
        {story.isSample && <Badge tone="sample">Sample</Badge>}
      </header>

      {isCompact ? (
        <>
          <p className="mt-2.5 font-body text-sm leading-snug">
            <span className="text-text/60">What they did: </span>
            {story.decision}
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-body text-xs text-text/70">
            <CheckCircle size={14} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Why it matches:</span>
            {story.matchReasons.join(' · ')}
          </p>
        </>
      ) : (
        <>
          <dl className="mt-3.5 grid gap-3 border-t border-text/[0.06] pt-3.5 font-body text-sm sm:grid-cols-2 sm:gap-5">
            <div>
              <dt className="text-xs font-medium tracking-wide text-text/60 uppercase">What they did</dt>
              <dd className="mt-1 leading-snug">{story.decision}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-text/60 uppercase">How it turned out</dt>
              <dd className="mt-1 leading-snug">{story.outcome}</dd>
            </div>
          </dl>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="font-body text-xs font-medium text-text/60">Why it matches</span>
            <ul className="flex flex-wrap gap-1.5">
              {story.matchReasons.map((reason) => (
                <li key={reason}>
                  <Badge icon={<CheckCircle size={14} className="text-primary" aria-hidden="true" />}>
                    {reason}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </article>
  )
}
