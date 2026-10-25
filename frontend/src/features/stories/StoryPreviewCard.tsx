import { ArrowRight, Car, CheckCircle } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { Badge } from '../../components/ui/Badge.tsx'
import type { StoryPreview } from '../../types/story.ts'

type StoryPreviewCardProps = {
  story: StoryPreview
  variant?: 'full' | 'compact' | 'match'
  readMoreHref?: string
}

const cardClassName =
  'relative rounded-2xl border border-text/[0.06] bg-surface shadow-card transition-shadow duration-300 ease-out hover:shadow-card-hover'

const termClassName = 'text-xs font-medium tracking-wide text-text/60 uppercase'

function StoryHeader({ story, subtitle }: { story: StoryPreview; subtitle: string }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-heading text-base font-bold leading-snug tracking-tight">{story.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-text/70">
          <Car size={16} className="shrink-0 text-primary" aria-hidden="true" />
          {subtitle}
        </p>
      </div>
      {story.isSample && <Badge tone="sample">Sample</Badge>}
    </header>
  )
}

function MatchedStoryCard({ story, readMoreHref }: { story: StoryPreview; readMoreHref?: string }) {
  const subtitle = [story.vehicle, story.accidentType].filter(Boolean).join(' · ')

  return (
    <article
      className={`${cardClassName} group flex w-full flex-col p-4 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary`}
    >
      <StoryHeader story={story} subtitle={subtitle} />

      <dl className="mt-3 space-y-2.5 border-t border-text/[0.06] pt-3 font-body text-sm">
        <div>
          <dt className={termClassName}>What they decided</dt>
          <dd className="mt-0.5 leading-snug">{story.decision}</dd>
        </div>
        <div>
          <dt className={termClassName}>
            Reported outcome
            {story.reportedAfter && (
              <span className="font-normal tracking-normal normal-case"> · {story.reportedAfter}</span>
            )}
          </dt>
          <dd className="mt-0.5 leading-snug">{story.outcome}</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-xl bg-primary-light/70 px-3 py-2.5 font-body text-xs">
        <p className="flex items-center gap-1.5 font-semibold text-primary">
          <CheckCircle size={14} weight="fill" className="shrink-0" aria-hidden="true" />
          Why it matches you
        </p>
        <p className="mt-1 leading-snug text-text/80">{story.matchReasons.join(' · ')}</p>
      </div>

      {readMoreHref && (
        <Link
          to={readMoreHref}
          className="mt-auto inline-flex items-center gap-1 self-start pt-3 font-body text-sm font-semibold text-primary outline-none after:absolute after:inset-0 after:rounded-2xl group-hover:underline group-hover:underline-offset-4"
        >
          Read full story
          <span className="sr-only">: {story.title}</span>
          <ArrowRight
            size={14}
            className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}
    </article>
  )
}

export function StoryPreviewCard({ story, variant = 'full', readMoreHref }: StoryPreviewCardProps) {
  if (variant === 'match') {
    return <MatchedStoryCard story={story} readMoreHref={readMoreHref} />
  }

  const isCompact = variant === 'compact'

  return (
    <article className={`${cardClassName} ${isCompact ? 'px-5 py-4' : 'p-5'}`}>
      <StoryHeader story={story} subtitle={story.vehicle} />

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
              <dt className={termClassName}>What they did</dt>
              <dd className="mt-1 leading-snug">{story.decision}</dd>
            </div>
            <div>
              <dt className={termClassName}>How it turned out</dt>
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
