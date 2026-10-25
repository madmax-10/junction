import { ArrowRight, Check, Compass, Sparkle, UsersThree } from '@phosphor-icons/react'
import {
  motion,
  stagger,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from 'motion/react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { easeOutQuint, staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'

type MatchedExperience = {
  id: string
  vehicle: string
  mileage: string
  similarity: string
  decision: string
  outcome: string
}

// Synthetic demo content. These are not real people or real outcomes.
const matchedExperiences: MatchedExperience[] = [
  {
    id: 'civic-body-shop',
    vehicle: '2019 Honda Civic EX',
    mileage: '64,000 mi',
    similarity: 'Same model · Rear-end',
    decision: 'Repaired at a body shop',
    outcome: 'Estimate came in under the payout. Fixed in 12 days.',
  },
  {
    id: 'civic-payout',
    vehicle: '2018 Honda Civic LX',
    mileage: '81,000 mi',
    similarity: 'Same model · Rear-end',
    decision: 'Took the $11,200 payout',
    outcome: 'Repairs cost more than the car was worth. Bought a newer Civic.',
  },
]

const headerVariants = staggerVariants(0.1)

const comparisonVariants = staggerVariants(0.35, 0.15)

const arrowRevealVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: easeOutQuint } },
}

const junctionPanelVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: easeOutQuint, delayChildren: stagger(0.16, { startDelay: 0.2 }) },
  },
}

const storyCardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOutQuint, delayChildren: 0.45 } },
}

const storyActionsVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOutQuint } },
}

const termClassName = 'font-body text-xs font-semibold tracking-wide text-muted uppercase'

const termRowClassName = 'grid gap-0.5 sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:gap-x-3'

const highlightClassName = 'underline decoration-sage/35 decoration-2 underline-offset-[5px]'

function StoryCard({ experience }: { experience: MatchedExperience }) {
  const [isRequested, setIsRequested] = useState(false)
  const titleId = `matched-${experience.id}`

  return (
    <motion.article
      variants={storyCardVariants}
      aria-labelledby={titleId}
      className="group rounded-2xl bg-surface/80 px-4 py-3.5 transition-[background-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:bg-surface hover:shadow-card-hover sm:px-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <div className="flex items-baseline gap-2">
          <h4 id={titleId} className="font-heading text-base font-bold tracking-tight">
            {experience.vehicle}
          </h4>
          <span className="font-body text-sm text-muted">{experience.mileage}</span>
        </div>
        <span className="font-body text-xs font-semibold text-sage">{experience.similarity}</span>
      </header>

      <dl className="mt-2 flex flex-col gap-1.5 font-body text-sm leading-snug sm:gap-1">
        <div className={termRowClassName}>
          <dt className={`${termClassName} sm:pt-0.5`}>Decided</dt>
          <dd className="font-semibold text-text">{experience.decision}</dd>
        </div>
        <div className={termRowClassName}>
          <dt className={`${termClassName} sm:pt-0.5`}>Outcome</dt>
          <dd className="text-text/75">{experience.outcome}</dd>
        </div>
      </dl>

      <motion.div
        variants={storyActionsVariants}
        className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-sm font-semibold"
      >
        <Link
          to={paths.stories}
          className="group/link inline-flex items-center gap-1 rounded-sm text-sage outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
        >
          Read their story
          <span className="sr-only">: {experience.vehicle}</span>
          <ArrowRight
            size={14}
            className="transition-transform duration-200 ease-out group-hover/link:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
        <button
          type="button"
          onClick={() => setIsRequested(true)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 ${
            isRequested ? 'bg-sage text-surface' : 'border border-sage/30 text-sage hover:bg-sage-light'
          }`}
        >
          {isRequested ? (
            <>
              <Check size={14} weight="bold" aria-hidden="true" />
              Request sent
            </>
          ) : (
            'Request to connect'
          )}
        </button>
        <span className="sr-only" aria-live="polite">
          {isRequested ? `Connection request sent to the ${experience.vehicle} owner` : ''}
        </span>
      </motion.div>
    </motion.article>
  )
}

type FlowArrowProps = {
  drawn?: MotionValue<number>
  headOpacity?: MotionValue<number>
}

function FlowArrow({ drawn, headOpacity }: FlowArrowProps) {
  return (
    <svg
      viewBox="0 0 122 140"
      fill="none"
      aria-hidden="true"
      className="h-24 w-auto rotate-90 overflow-visible text-sage lg:h-auto lg:w-full lg:rotate-0"
    >
      <path
        d="M6 52C36 128 88 124 116 72"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="2 6"
        strokeLinecap="round"
        className="opacity-25"
      />
      <motion.path
        d="M6 52C36 128 88 124 116 72"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        style={drawn && { pathLength: drawn }}
      />
      <motion.path
        d="M104.9 78.8L116 72L116.4 85"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={headOpacity && { opacity: headOpacity }}
      />
    </svg>
  )
}

export function WhyDifferent() {
  const prefersReducedMotion = useReducedMotion()
  const comparisonRef = useRef<HTMLDivElement>(null)
  const [hasArrived, setHasArrived] = useState(false)

  const { scrollYProgress } = useScroll({ target: comparisonRef, offset: ['start 0.85', 'center 0.55'] })
  const drawn = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 })
  const headOpacity = useTransform(drawn, [0.88, 1], [0, 1])
  const genericOpacity = useTransform(drawn, [0.5, 1], [1, 0.85])

  useMotionValueEvent(scrollYProgress, 'change', (progress) => setHasArrived(progress > 0.9))

  const isJunctionFocused = prefersReducedMotion || hasArrived

  return (
    <section aria-labelledby="why-different-title" className="border-y border-border bg-surface py-28 sm:py-32">
      <div className={sectionContainerClassName}>
        <motion.header
          {...revealOnScroll}
          variants={headerVariants}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <motion.h2
            id="why-different-title"
            variants={riseVariants}
            className="font-heading text-[2.15rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl"
          >
            Less guessing. More real experiences.
          </motion.h2>
          <motion.figure variants={riseVariants} className="mt-10">
            <figcaption className={termClassName}>Example question</figcaption>
            <blockquote className="mt-3 max-w-xl font-heading text-xl leading-snug font-semibold tracking-tight text-balance text-text/85 sm:text-2xl">
              “My 2019 Civic was rear-ended. Should I repair it or take the insurance payout?”
            </blockquote>
          </motion.figure>
        </motion.header>

        <motion.div
          ref={comparisonRef}
          {...revealOnScroll}
          variants={comparisonVariants}
          className="mt-16 grid gap-6 sm:mt-20 lg:grid-cols-[minmax(0,0.9fr)_8rem_minmax(0,1.3fr)] lg:gap-2"
        >
          <motion.div variants={riseVariants}>
            <motion.div
              style={prefersReducedMotion ? undefined : { opacity: genericOpacity }}
              className="flex h-full flex-col rounded-[2rem] bg-primary-light/55 p-7 sm:p-9"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-text/70">
                  <Sparkle size={16} className="text-primary/60" aria-hidden="true" />
                  Generic AI answer
                </h3>
                <span className="rounded-full border border-primary/15 px-3 py-1 font-body text-xs font-medium text-primary/75">
                  General guidance
                </span>
              </div>
              <p className="mt-8 font-body text-xl leading-relaxed text-pretty text-text/60">
                “It depends on several factors, including repair costs, your car’s value, and your coverage. Consider
                getting multiple estimates and speaking with your insurer before deciding.”
              </p>
              <p className="mt-auto border-t border-primary/10 pt-5 font-body text-sm text-text/55 max-lg:mt-8">
                Based on general patterns. No sources or real outcomes.
              </p>
            </motion.div>
          </motion.div>

          <motion.div variants={arrowRevealVariants} className="flex justify-center self-center py-2 lg:py-0">
            <FlowArrow
              drawn={prefersReducedMotion ? undefined : drawn}
              headOpacity={prefersReducedMotion ? undefined : headOpacity}
            />
          </motion.div>

          <motion.div variants={junctionPanelVariants}>
            <div
              className={`rounded-[2rem] bg-sage-light p-5 transition-[box-shadow] duration-700 ease-out sm:p-6 ${
                isJunctionFocused ? 'shadow-card-hover' : 'shadow-none'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-heading text-base font-bold">
                  <UsersThree size={18} className="text-sage" aria-hidden="true" />
                  With Junction
                </h3>
                <span className="rounded-full bg-surface/80 px-3 py-1 font-body text-xs font-medium text-sage">
                  Sample data
                </span>
              </div>

              <motion.div variants={riseVariants} className="mt-4">
                <p className="flex items-center gap-2 font-body text-xs font-semibold tracking-wide text-sage uppercase">
                  <Compass size={15} aria-hidden="true" />
                  What we’d suggest exploring
                </p>
                <p className="mt-2 font-heading text-lg leading-snug font-bold tracking-tight text-pretty sm:text-xl sm:leading-snug">
                  Start by comparing your <span className={highlightClassName}>repair estimate</span> with your{' '}
                  <span className={highlightClassName}>insurer’s payout</span>. Drivers with similar rear-end damage took
                  different paths depending on these numbers.
                </p>
              </motion.div>

              <motion.p
                variants={riseVariants}
                className="mt-5 flex items-center gap-3 font-body text-xs font-semibold tracking-wide text-muted uppercase"
              >
                Supporting stories
                <span className="h-px flex-1 bg-sage/15" aria-hidden="true" />
              </motion.p>

              <ul className="mt-3 flex flex-col gap-2.5">
                {matchedExperiences.map((experience) => (
                  <li key={experience.id}>
                    <StoryCard experience={experience} />
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
