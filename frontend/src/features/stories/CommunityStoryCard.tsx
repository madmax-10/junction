import { CaretDown, Car, CheckCircle, Hourglass, Lightbulb, User } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Badge } from '../../components/ui/Badge.tsx'
import { easeOutQuint } from '../../styles/motion.ts'
import type { CommunityStory, StoryStatus } from '../../types/story.ts'
import { formatPrice } from '../marketplace/marketplaceOptions.tsx'
import { getSymptomLabel, getVehicleName } from './storyFilters.ts'
import { getMethodOption, statusLabels } from './storyOptions.tsx'

type CommunityStoryCardProps = {
  story: CommunityStory
  isExpanded: boolean
  onToggle: () => void
}

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

function SolutionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-1.5 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function StoryDetails({ story }: { story: CommunityStory }) {
  const { cost, mechanic_name, insurance_settlement, method, symptoms } = story.post_data
  const symptomLines = [...(symptoms.confirmed ?? []), ...(symptoms.inferred ?? [])]
  const decision =
    method === 'mechanic'
      ? `Repaired by ${mechanic_name || 'a mechanic'}`
      : 'Repaired it themselves'

  return (
    <>
      <div className="mt-4 grid gap-5 border-t border-border pt-4 @2xl:grid-cols-2 @2xl:gap-8">
        <div className="space-y-5">
          <section>
            <h3 className={termClassName}>What they decided</h3>
            <p className="mt-1 font-body text-sm leading-relaxed">{decision}</p>
          </section>

          {(cost !== null || mechanic_name || insurance_settlement) && (
            <section>
              <h3 className={termClassName}>Reported costs</h3>
              <dl className="mt-1.5 font-body text-sm">
                {cost !== null && <SolutionRow label="Repair cost" value={formatPrice(cost)} />}
                {mechanic_name && <SolutionRow label="Mechanic" value={mechanic_name} />}
                {insurance_settlement && <SolutionRow label="Insurance settlement" value={insurance_settlement} />}
              </dl>
            </section>
          )}
        </div>

        <section>
          <h3 className={termClassName}>Symptoms</h3>
          <ul className="mt-1.5 space-y-2.5 font-body text-sm leading-relaxed">
            {symptomLines.map((symptom) => (
              <li key={symptom} className="flex gap-2.5">
                <Lightbulb size={16} weight="duotone" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                {symptom}
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
  const method = getMethodOption(story.post_data.method)
  const symptomLabel = getSymptomLabel(story)
  const displayStatus: StoryStatus = story.post_data.work_performed || story.post_data.cost !== null ? 'resolved' : 'ongoing'
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
          <span className="truncate">
            Anonymous owner{story.post_data.mechanic_name ? ` · ${story.post_data.mechanic_name}` : ''}
          </span>
        </p>
        <StatusBadge status={displayStatus} />
      </div>

      <header className="mt-3">
        <h2 id={titleId} className="font-heading text-lg leading-snug font-bold tracking-tight">
          {story.title}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 font-body text-sm text-muted">
          <Car size={16} className="shrink-0 text-primary" aria-hidden="true" />
          {getVehicleName(story)} · {numberFormat.format(story.post_data.mileage)} mi
        </p>
      </header>

      <section className="mt-4">
        <h3 className={termClassName}>
          What happened{symptomLabel && <span className={asideClassName}> · {symptomLabel}</span>}
        </h3>
        <p className={`mt-1 font-body text-sm leading-relaxed text-text/85 ${clampClassName}`}>{story.content}</p>
      </section>

      <section className="mt-4 rounded-xl bg-background/70 p-3.5">
        <h3 className="sr-only">Decision and outcome</h3>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-surface px-2.5 py-1 font-body text-xs font-semibold text-primary">
          {method.icon}
          <span className="sr-only">Repair method: </span>
          {method.label}
        </p>
        <p className={`mt-2.5 ${termClassName}`}>
          {displayStatus === 'resolved' ? 'Reported outcome' : 'Where things stand'}
          {story.post_data.insurance_settlement && (
            <span className={asideClassName}> · {story.post_data.insurance_settlement}</span>
          )}
        </p>
        <p className={`mt-0.5 font-body text-sm leading-snug ${clampClassName}`}>{story.post_data.work_performed}</p>
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
