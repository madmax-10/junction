import { CaretDown, Car, CheckCircle, Hourglass, Lightbulb, User } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Badge } from '../../components/ui/Badge.tsx'
import { easeOutQuint } from '../../styles/motion.ts'
import type { CommunityStory, StoryStatus } from '../../types/story.ts'
import { getAccidentLabel, getVehicleName } from './storyFilters.ts'
import { getChoiceOption, statusLabels } from './storyOptions.tsx'

type CommunityStoryCardProps = {
  story: CommunityStory
  isExpanded: boolean
  onToggle: () => void
}

const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const numberFormat = new Intl.NumberFormat('en-US')
const detailsTransition = { duration: 0.3, ease: easeOutQuint }

const termClassName = 'font-body text-xs font-medium tracking-wide text-muted uppercase'
const asideClassName = 'font-normal tracking-normal normal-case'

function StatusBadge({ status }: { status: StoryStatus }) {
  return status === 'resolved' ? (
    <Badge tone="secondary" icon={<CheckCircle size={14} weight="fill" aria-hidden="true" />}>
      {statusLabels.resolved}
    </Badge>
  ) : (
    <Badge icon={<Hourglass size={14} aria-hidden="true" />}>{statusLabels.ongoing}</Badge>
  )
}

function StoryDetails({ story }: { story: CommunityStory }) {
  const { costs } = story.outcome

  return (
    <>
      <div className="mt-4 grid gap-5 border-t border-border pt-4 @2xl:grid-cols-2 @2xl:gap-8">
        <div className="space-y-5">
          <section>
            <h3 className={termClassName}>What they decided</h3>
            <p className="mt-1 font-body text-sm leading-relaxed">{story.decision.summary}</p>
          </section>

          {costs.length > 0 && (
            <section>
              <h3 className={termClassName}>Reported costs</h3>
              <dl className="mt-1.5 font-body text-sm">
                {costs.map((cost) => (
                  <div
                    key={cost.label}
                    className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-1.5 last:border-b-0"
                  >
                    <dt className="text-muted">{cost.label}</dt>
                    <dd className="font-medium tabular-nums">{currencyFormat.format(cost.amount)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        <section>
          <h3 className={termClassName}>What they learned</h3>
          <ul className="mt-1.5 space-y-2.5 font-body text-sm leading-relaxed">
            {story.lessons.map((lesson) => (
              <li key={lesson} className="flex gap-2.5">
                <Lightbulb size={16} weight="duotone" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                {lesson}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

export function CommunityStoryCard({ story, isExpanded, onToggle }: CommunityStoryCardProps) {
  const articleRef = useRef<HTMLElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const choice = getChoiceOption(story.decision.choice)
  const titleId = `${story.id}-title`
  const detailsId = `${story.id}-details`
  const clampClassName = isExpanded ? '' : 'line-clamp-2'

  useEffect(() => {
    if (isExpanded) {
      articleRef.current?.scrollIntoView({ block: 'start', behavior: shouldReduceMotion ? 'auto' : 'smooth' })
    }
  }, [isExpanded, shouldReduceMotion])

  return (
    <article
      ref={articleRef}
      aria-labelledby={titleId}
      className={`flex h-full scroll-mt-4 flex-col @3xl:scroll-mt-40 rounded-2xl border bg-surface p-5 shadow-card transition-[box-shadow,border-color] duration-300 ease-out hover:shadow-card-hover ${
        isExpanded ? 'border-primary/20' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 font-body text-xs text-muted">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-light text-primary" aria-hidden="true">
            <User size={13} weight="bold" />
          </span>
          <span className="truncate">Anonymous owner · {story.owner.location}</span>
        </p>
        <StatusBadge status={story.status} />
      </div>

      <header className="mt-3">
        <h2 id={titleId} className="font-heading text-lg leading-snug font-bold tracking-tight">
          {story.title}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-muted">
          <Car size={16} className="shrink-0 text-primary" aria-hidden="true" />
          {getVehicleName(story)} · {numberFormat.format(story.vehicle.mileage)} mi
        </p>
      </header>

      <section className="mt-4">
        <h3 className={termClassName}>
          What happened <span className={asideClassName}>· {getAccidentLabel(story)}</span>
        </h3>
        <p className={`mt-1 font-body text-sm leading-relaxed text-text/85 ${clampClassName}`}>{story.narrative}</p>
      </section>

      <section className="mt-4 rounded-xl bg-background/70 p-3.5">
        <h3 className="sr-only">Decision and outcome</h3>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-surface px-2.5 py-1 font-body text-xs font-semibold text-primary">
          {choice.icon}
          <span className="sr-only">Decision: </span>
          {choice.label}
        </p>
        <p className={`mt-2.5 ${termClassName}`}>
          {story.status === 'resolved' ? 'Reported outcome' : 'Where things stand'}{' '}
          <span className={asideClassName}>· {story.outcome.reportedAfter}</span>
        </p>
        <p className={`mt-0.5 font-body text-sm leading-snug ${clampClassName}`}>{story.outcome.summary}</p>
      </section>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="details"
            id={detailsId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={detailsTransition}
            className="overflow-hidden"
          >
            <StoryDetails story={story} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          className="inline-flex items-center gap-1 rounded-full font-body text-sm font-semibold text-primary outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
        >
          {isExpanded ? 'Show less' : 'Read full story'}
          <span className="sr-only">: {story.title}</span>
          <CaretDown
            size={14}
            weight="bold"
            className={`transition-transform duration-200 ease-out ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
    </article>
  )
}
