import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowUp,
  BookOpenText,
  Car,
  ChatsCircle,
  HandWaving,
  LockSimple,
  MapPin,
  PencilSimpleLine,
  Storefront,
  Wrench,
  type Icon,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useInView, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { easeOutQuint, staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

type CapabilityId = 'experiences' | 'drivers' | 'story' | 'marketplace' | 'shops'

type Capability = {
  id: CapabilityId
  icon: Icon
  title: string
  detail: string
  to: string
  // Conversation stage at which this capability lights up.
  stage: number
}

type Point = {
  x: number
  y: number
}

const capabilities: Capability[] = [
  {
    id: 'experiences',
    icon: BookOpenText,
    title: 'Find similar experiences and outcomes',
    detail: 'Matched on your car and damage',
    to: paths.stories,
    stage: 3,
  },
  {
    id: 'drivers',
    icon: HandWaving,
    title: 'Connect with drivers who’ve been there',
    detail: 'Ask what they’d do differently',
    to: paths.stories,
    stage: 4,
  },
  {
    id: 'story',
    icon: PencilSimpleLine,
    title: 'Create a shareable story',
    detail: 'Drafted for you, posted only with your approval',
    to: paths.myStory,
    stage: 6,
  },
  {
    id: 'marketplace',
    icon: Storefront,
    title: 'List a damaged car or explore replacements',
    detail: 'Sell it as-is or find what’s next',
    to: paths.marketplace,
    stage: 7,
  },
  {
    id: 'shops',
    icon: Wrench,
    title: 'Find repair shops recommended in stories',
    detail: 'Or nearby alternatives',
    to: paths.chat,
    stage: 8,
  },
]

// Delay in ms before advancing from stage N to N + 1.
// 1: user message · 2: typing · 3–4: first reply · 5: typing · 6–8: second reply
const stageDelays = [300, 700, 1400, 1300, 900, 1300, 1300, 1400]
const finalStage = stageDelays.length

const stackOffsetClassNames = ['', 'pl-6', 'pl-2', 'pl-8', 'pl-3']

const termClassName = 'font-body text-xs font-semibold tracking-wide text-muted uppercase'

const layoutVariants = staggerVariants(0.15, 0.1)

const stackVariants = staggerVariants(0.08)

const partVariants: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: easeOutQuint } },
}

const connectorVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8, delay: 0.3 } },
}

function centerWithin(element: HTMLElement, ancestor: HTMLElement): Point {
  let x = element.offsetWidth / 2
  let y = element.offsetHeight / 2
  let node: HTMLElement | null = element

  // offsetLeft/offsetTop ignore transforms, so reveal animations don't skew the connectors.
  while (node && node !== ancestor) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }

  return { x, y }
}

function segmentPath(from: Point, to: Point) {
  const bend = (to.y - from.y) * 0.5
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`
}

function Reveal({ shown, className = '', children }: { shown: boolean; className?: string; children: ReactNode }) {
  return (
    <motion.div initial={false} animate={shown ? 'shown' : 'hidden'} variants={partVariants} className={className}>
      {children}
    </motion.div>
  )
}

type ConversationPartProps = {
  id: CapabilityId
  shown: boolean
  focusedId: CapabilityId | null
  onFocusChange: (id: CapabilityId | null) => void
  children: ReactNode
}

function ConversationPart({ id, shown, focusedId, onFocusChange, children }: ConversationPartProps) {
  const isFocused = focusedId === id
  const isDimmed = focusedId !== null && !isFocused

  return (
    <Reveal shown={shown}>
      <div
        onMouseEnter={() => shown && onFocusChange(id)}
        onMouseLeave={() => onFocusChange(null)}
        className={`rounded-2xl ring-offset-[6px] ring-offset-surface-dark transition-[opacity,box-shadow] duration-300 ease-out ${
          isDimmed ? 'opacity-45' : ''
        } ${isFocused ? 'ring-1 ring-accent/70' : 'ring-0 ring-transparent'}`}
      >
        {children}
      </div>
    </Reveal>
  )
}

type AssistantTurnProps = {
  isStarted: boolean
  isTyping: boolean
  typingLabel: string
  children: ReactNode
}

const typingDots = [0, 1, 2]

function AssistantTurn({ isStarted, isTyping, typingLabel, children }: AssistantTurnProps) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <motion.span
        initial={false}
        animate={{ opacity: isStarted ? 1 : 0, scale: isStarted ? 1 : 0.6 }}
        transition={{ duration: 0.5, ease: easeOutQuint }}
        className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-surface"
        aria-hidden="true"
      >
        <ChatsCircle size={18} />
      </motion.span>

      <div className="relative min-w-0 flex-1">
        <AnimatePresence>
          {isTyping && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="absolute top-0 left-0 flex items-center gap-3 rounded-full bg-surface/8 px-4 py-2"
            >
              <span className="flex items-center gap-1" aria-hidden="true">
                {typingDots.map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-1.5 rounded-full bg-secondary-light"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </span>
              <span className="font-body text-sm text-surface/60">{typingLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  )
}

type ConversationPreviewProps = {
  stage: number
  focusedId: CapabilityId | null
  onFocusChange: (id: CapabilityId | null) => void
  canReplay: boolean
  onReplay: () => void
}

function ConversationPreview({ stage, focusedId, onFocusChange, canReplay, onReplay }: ConversationPreviewProps) {
  const reached = (id: CapabilityId) => stage >= (capabilities.find((capability) => capability.id === id)?.stage ?? 0)
  const partProps = { focusedId, onFocusChange }

  return (
    <figure className="relative isolate overflow-hidden rounded-[2rem] bg-surface-dark p-5 text-surface shadow-card-hover sm:p-8">
      <div aria-hidden="true" className="absolute -top-28 -right-20 -z-10 size-80 rounded-full bg-secondary/45 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 -left-24 -z-10 size-80 rounded-full bg-primary/30 blur-3xl" />

      <header className="flex items-center justify-between gap-3 border-b border-surface/10 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-surface" aria-hidden="true">
            <ChatsCircle size={22} />
          </span>
          <div>
            <p className="font-heading text-base leading-tight font-bold">Junction</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-body text-xs text-surface/55">
              <span className="size-1.5 rounded-full bg-sage-light" aria-hidden="true" />
              AI Companion
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReplay}
            disabled={!canReplay}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-xs font-semibold text-surface/75 outline-none transition-[opacity,background-color] duration-300 hover:bg-surface/10 focus-visible:ring-2 focus-visible:ring-accent ${
              canReplay ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
            Replay
          </button>
          <figcaption className="hidden rounded-full border border-surface/15 px-3 py-1 font-body text-xs text-surface/65 sm:block">
            Sample conversation
          </figcaption>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-6 sm:mt-7">
        <Reveal shown={stage >= 1} className="flex justify-end">
          <p className="max-w-[88%] rounded-3xl rounded-br-lg bg-primary px-4 py-3 font-body text-[0.95rem] leading-relaxed text-surface sm:max-w-[78%]">
            Someone backed into my 2017 Mazda3. The bumper’s crushed, the trunk won’t latch, and my insurer says it
            might be totaled. Where do I even start?
          </p>
        </Reveal>

        <AssistantTurn isStarted={stage >= 2} isTyping={stage === 2} typingLabel="Looking through experiences…">
          <ConversationPart id="experiences" shown={reached('experiences')} {...partProps}>
            <p className="font-heading text-lg leading-snug font-semibold tracking-tight text-pretty sm:text-xl sm:leading-snug">
              That’s a lot at once. <span className="text-accent">14 drivers</span> with similar rear damage on a
              Mazda3 shared how it went.
            </p>
            <div className="mt-3.5 rounded-2xl border border-surface/10 bg-surface/6 p-4">
              <div className="flex h-2 gap-1" aria-hidden="true">
                <motion.span
                  initial={false}
                  animate={{ scaleX: reached('experiences') ? 1 : 0 }}
                  transition={{ duration: 0.9, delay: 0.25, ease: easeOutQuint }}
                  className="w-[64%] origin-left rounded-full bg-secondary-light"
                />
                <motion.span
                  initial={false}
                  animate={{ scaleX: reached('experiences') ? 1 : 0 }}
                  transition={{ duration: 0.9, delay: 0.45, ease: easeOutQuint }}
                  className="flex-1 origin-left rounded-full bg-accent"
                />
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 font-body text-sm">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-secondary-light" aria-hidden="true" />
                  <dt className="text-surface/60">Repaired</dt>
                  <dd className="font-semibold">9</dd>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                  <dt className="text-surface/60">Took the payout</dt>
                  <dd className="font-semibold">5</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-surface/60">Median repair</dt>
                  <dd className="font-semibold">$3,900</dd>
                </div>
              </dl>
            </div>
          </ConversationPart>

          <ConversationPart id="drivers" shown={reached('drivers')} {...partProps}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl border border-surface/10 bg-surface/6 p-3 pr-3.5">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-light font-heading text-sm font-bold text-primary"
                aria-hidden="true"
              >
                DR
              </span>
              <div className="min-w-[11rem] flex-1">
                <p className="font-body text-sm font-semibold">Dana R. · 2018 Mazda3</p>
                <p className="font-body text-sm leading-snug text-surface/60">
                  Disputed a total-loss call and got it repaired.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-3 py-1.5 font-body text-xs font-semibold text-surface-dark max-sm:ml-13">
                Ask Dana
              </span>
            </div>
          </ConversationPart>
        </AssistantTurn>

        <AssistantTurn isStarted={stage >= 5} isTyping={stage === 5} typingLabel="Checking shops near you…">
          <ConversationPart id="story" shown={reached('story')} {...partProps}>
            <p className="inline-flex items-start gap-2 rounded-xl border border-dashed border-surface/20 px-3.5 py-2 font-body text-xs leading-relaxed text-surface/70">
              <LockSimple size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              Saving a private draft of your story. It’s shared only if you approve.
            </p>
          </ConversationPart>

          <ConversationPart id="marketplace" shown={reached('marketplace')} {...partProps}>
            <p className="font-heading text-lg leading-snug font-semibold tracking-tight text-pretty sm:text-xl sm:leading-snug">
              If it is totaled, you can sell it as-is or move on to something new.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 font-body text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-surface/15 px-3 py-1.5">
                <Storefront size={14} className="text-accent" aria-hidden="true" />
                List as-is · est. $2,800
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-surface/15 px-3 py-1.5">
                <Car size={14} className="text-accent" aria-hidden="true" />
                Replacements under $15k
              </span>
            </div>
          </ConversationPart>

          <ConversationPart id="shops" shown={reached('shops')} {...partProps}>
            <div className="relative overflow-hidden rounded-2xl bg-surface p-4 text-text shadow-card-hover sm:p-5">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
              <p className="font-body text-xs font-semibold tracking-wide text-primary uppercase">
                But first, your next step
              </p>
              <p className="mt-1.5 font-heading text-lg leading-snug font-bold tracking-tight text-pretty">
                Get an independent estimate before you accept the offer.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-border pt-4">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary-light text-secondary"
                  aria-hidden="true"
                >
                  <Wrench size={18} />
                </span>
                <div className="min-w-[11rem] flex-1">
                  <p className="font-body text-sm font-semibold">Eastside Collision</p>
                  <p className="font-body text-xs text-muted">Recommended in 4 stories · 2.1 mi</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary px-3.5 py-2 font-body text-xs font-semibold text-surface max-sm:ml-12">
                  Book estimate
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1.5 font-body text-xs text-muted">
                <MapPin size={14} aria-hidden="true" />3 more shops nearby
              </p>
            </div>
          </ConversationPart>
        </AssistantTurn>
      </div>

      <Link
        to={paths.chat}
        className="group mt-7 flex items-center gap-3 rounded-full border border-surface/12 bg-surface/6 py-2 pr-2 pl-5 text-surface/55 outline-none transition-colors duration-300 ease-out hover:border-surface/25 hover:bg-surface/10 focus-visible:ring-2 focus-visible:ring-accent sm:mt-8"
      >
        <span className="flex-1 font-body text-sm">
          Tell Junction what happened…<span className="sr-only"> Start a conversation</span>
        </span>
        <span
          className="grid size-9 place-items-center rounded-full bg-primary text-surface transition-transform duration-300 ease-out group-hover:-translate-y-0.5"
          aria-hidden="true"
        >
          <ArrowUp size={16} weight="bold" />
        </span>
      </Link>
    </figure>
  )
}

type CapabilityStackProps = {
  stage: number
  highlightId: CapabilityId | null
  onFocusChange: (id: CapabilityId | null) => void
}

function CapabilityStack({ stage, highlightId, onFocusChange }: CapabilityStackProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const activeCount = capabilities.filter((capability) => stage >= capability.stage).length

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      setPoints(nodeRefs.current.flatMap((node) => (node ? [centerWithin(node, list)] : [])))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 pl-2">
        <p className={termClassName}>Unlocked along the way</p>
        <p className="font-heading text-sm font-bold text-secondary tabular-nums" aria-hidden="true">
          {activeCount}
          <span className="text-text/30"> / {capabilities.length}</span>
        </p>
      </div>

      <motion.ol ref={listRef} {...revealOnScroll} variants={stackVariants} className="relative mt-4">
        <motion.svg
          variants={connectorVariants}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          {points.slice(1).map((point, index) => {
            const d = segmentPath(points[index], point)
            const isDrawn = stage >= capabilities[index + 1].stage

            return (
              <g key={capabilities[index + 1].id} fill="none" stroke="currentColor" strokeLinecap="round">
                <path d={d} strokeWidth={1.5} strokeDasharray="2 5" className="text-text/20" />
                <motion.path
                  d={d}
                  strokeWidth={2}
                  className="text-secondary"
                  initial={false}
                  animate={{ pathLength: isDrawn ? 1 : 0, opacity: isDrawn ? 1 : 0 }}
                  transition={{ duration: 0.9, ease: easeOutQuint }}
                />
              </g>
            )
          })}
        </motion.svg>

        {capabilities.map((capability, index) => {
          const CapabilityIcon = capability.icon
          const isActive = stage >= capability.stage
          const isHighlighted = highlightId === capability.id

          return (
            <motion.li key={capability.id} variants={riseVariants} className={`relative ${stackOffsetClassNames[index]}`}>
              <Link
                to={capability.to}
                onMouseEnter={() => onFocusChange(capability.id)}
                onMouseLeave={() => onFocusChange(null)}
                onFocus={() => onFocusChange(capability.id)}
                onBlur={() => onFocusChange(null)}
                className="group relative isolate flex items-center gap-4 rounded-2xl py-3 pr-4 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                {isHighlighted && (
                  <motion.span
                    layoutId="capability-highlight"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-2xl bg-surface shadow-card"
                    transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  />
                )}

                <span
                  ref={(node) => {
                    nodeRefs.current[index] = node
                  }}
                  aria-hidden="true"
                  className={`relative grid size-10 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-500 ease-out group-hover:scale-105 ${
                    isActive ? 'border-secondary bg-secondary text-surface' : 'border-border bg-surface text-text/35'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      initial={{ scale: 1, opacity: 0.45 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: 'easeOut' }}
                      className="absolute inset-0 rounded-full bg-secondary"
                    />
                  )}
                  <CapabilityIcon size={18} weight={isActive ? 'fill' : 'regular'} className="relative" />
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-heading text-[0.95rem] leading-snug font-bold tracking-tight text-pretty transition-colors duration-500 ease-out ${
                      isActive ? 'text-text' : 'text-text/45'
                    }`}
                  >
                    {capability.title}
                  </span>
                  <span className="mt-0.5 block font-body text-sm leading-snug text-muted">{capability.detail}</span>
                </span>

                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 -translate-x-1 text-secondary opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                />
              </Link>
            </motion.li>
          )
        })}
      </motion.ol>
    </div>
  )
}

export function MoreWaysWeHelp() {
  const prefersReducedMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(panelRef, { once: true, amount: 0.35 })
  const [stage, setStage] = useState(0)
  const [focusedId, setFocusedId] = useState<CapabilityId | null>(null)

  useEffect(() => {
    if (!isInView || prefersReducedMotion || stage >= finalStage) return

    const timeout = window.setTimeout(() => setStage((current) => current + 1), stageDelays[stage])
    return () => window.clearTimeout(timeout)
  }, [isInView, prefersReducedMotion, stage])

  const visibleStage = prefersReducedMotion ? finalStage : stage
  const currentId = capabilities.findLast((capability) => visibleStage >= capability.stage)?.id ?? null

  function replay() {
    setFocusedId(null)
    setStage(0)
  }

  return (
    <section aria-labelledby="more-ways-title" className="pb-28 sm:pb-36">
      <div className={sectionContainerClassName}>
        <SectionIntro
          id="more-ways-title"
          title={
            <>
              One conversation. <span className="text-primary">Every next step.</span>
            </>
          }
          description="Tell Junction what happened. Stories, people, shops, and cars come in as the conversation needs them."
        />

        <motion.div
          {...revealOnScroll}
          variants={layoutVariants}
          className="mt-12 grid items-center gap-12 sm:mt-14 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-14 xl:gap-20"
        >
          <motion.div ref={panelRef} variants={riseVariants}>
            <ConversationPreview
              stage={visibleStage}
              focusedId={focusedId}
              onFocusChange={setFocusedId}
              canReplay={!prefersReducedMotion && stage >= finalStage}
              onReplay={replay}
            />
          </motion.div>

          <motion.div variants={riseVariants}>
            <CapabilityStack stage={visibleStage} highlightId={focusedId ?? currentId} onFocusChange={setFocusedId} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
