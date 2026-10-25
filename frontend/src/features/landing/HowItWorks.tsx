import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { easeOutQuint, staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'

type Step = {
  title: string
  description: string
}

type Point = {
  x: number
  y: number
}

const steps: Step[] = [
  {
    title: 'Describe your situation',
    description: 'Tell us what happened, in your own words.',
  },
  {
    title: 'Discover similar experiences',
    description: 'We match you with drivers whose car and accident mirror yours.',
  },
  {
    title: 'Explore real outcomes',
    description: 'See what they chose, what it cost, and how it turned out.',
  },
]

const stepOffsetClassNames = ['', 'ml-10 sm:ml-24', 'ml-4 sm:ml-12']

// Fraction of the viewport height where a step counts as "being read".
const readingLine = 0.6

const introVariants = staggerVariants(0.1)

const stepVariants = staggerVariants(0.09)

const numeralVariants: Variants = {
  hidden: { y: '105%' },
  visible: { y: '0%', transition: { duration: 1, ease: easeOutQuint } },
}

const markerVariants: Variants = {
  hidden: { scale: 0 },
  visible: { scale: 1, transition: { duration: 0.6, delay: 0.2, ease: easeOutQuint } },
}
function centerWithin(element: HTMLElement, ancestor: HTMLElement): Point {
  let x = element.offsetWidth / 2
  let y = element.offsetHeight / 2
  let node: HTMLElement | null = element

  // offsetLeft/offsetTop ignore transforms, so reveal animations don't skew the path.
  while (node && node !== ancestor) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }

  return { x, y }
}

function buildPath(points: Point[]) {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`

    const previous = points[index - 1]
    const bend = (point.y - previous.y) * 0.55
    return `${path} C ${previous.x} ${previous.y + bend}, ${point.x} ${point.y - bend}, ${point.x} ${point.y}`
  }, '')
}

function activeIndexFor(progress: number, points: Point[]) {
  if (progress <= 0 || points.length < 2) return -1

  const first = points[0].y
  const span = points[points.length - 1].y - first
  return points.reduce((active, point, index) => ((point.y - first) / span <= progress + 0.001 ? index : active), 0)
}

export function HowItWorks() {
  const prefersReducedMotion = useReducedMotion()
  const listRef = useRef<HTMLOListElement>(null)
  const markerRefs = useRef<(HTMLSpanElement | null)[]>([])
  const pointsRef = useRef<Point[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)

  const { scrollY } = useScroll()
  const progress = useMotionValue(0)
  const drawn = useSpring(progress, { stiffness: 140, damping: 30, restDelta: 0.001 })
  const drawnOpacity = useTransform(drawn, [0, 0.02], [0, 1])

  function syncProgress() {
    const list = listRef.current
    const currentPoints = pointsRef.current
    if (!list || currentPoints.length < 2) return

    const top = list.getBoundingClientRect().top
    const first = top + currentPoints[0].y
    const last = top + currentPoints[currentPoints.length - 1].y
    const next = Math.min(Math.max((window.innerHeight * readingLine - first) / (last - first), 0), 1)

    progress.set(next)
    setActiveIndex(activeIndexFor(next, currentPoints))
  }

  useMotionValueEvent(scrollY, 'change', syncProgress)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      const nextPoints = markerRefs.current.flatMap((marker) => (marker ? [centerWithin(marker, list)] : []))
      pointsRef.current = nextPoints
      setPoints(nextPoints)
      syncProgress()
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  const pathData = buildPath(points)
  const reachedIndex = prefersReducedMotion ? steps.length - 1 : activeIndex

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-8 py-32 sm:py-40">
      <div
        className={`${sectionContainerClassName} grid gap-20 sm:gap-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 xl:gap-24`}
      >
        <motion.div {...revealOnScroll} variants={introVariants} className="lg:sticky lg:top-32 lg:self-start">
          <motion.h2
            id="how-it-works-title"
            variants={riseVariants}
            className="font-heading text-[2.75rem] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl xl:text-7xl"
          >
            From uncertainty to <span className="text-primary">clarity.</span>
          </motion.h2>
          <motion.p
            variants={riseVariants}
            className="mt-8 max-w-sm font-body text-lg leading-relaxed text-pretty text-text/70"
          >
            A few minutes from what happened to what drivers like you did next.
          </motion.p>
        </motion.div>

        <ol ref={listRef} className="relative lg:pt-32">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <path d={pathData} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-text/10" />
            <motion.path
              d={pathData}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="text-primary"
              style={prefersReducedMotion ? undefined : { pathLength: drawn, opacity: drawnOpacity }}
            />
          </svg>

          {steps.map((step, index) => {
            const isActive = index === activeIndex
            const isReached = index <= reachedIndex

            return (
              <motion.li
                key={step.title}
                {...revealOnScroll}
                viewport={{ once: true, amount: 0.5 }}
                variants={stepVariants}
                className={`relative pb-24 pl-12 last:pb-0 sm:pb-32 sm:pl-16 ${stepOffsetClassNames[index]}`}
              >
                <div className="relative flex items-center">
                  <motion.span
                    ref={(marker) => {
                      markerRefs.current[index] = marker
                    }}
                    aria-hidden="true"
                    variants={markerVariants}
                    className={`absolute top-1/2 -left-12 -mt-[7px] -ml-[7px] size-3.5 rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-500 ease-out sm:-left-16 ${
                      isReached ? 'border-primary bg-primary' : 'border-text/20 bg-background'
                    } ${isActive ? 'shadow-[0_0_0_6px_color-mix(in_oklab,var(--color-primary)_14%,transparent)]' : ''}`}
                  />
                  <span aria-hidden="true" className="overflow-hidden">
                    <motion.span
                      variants={numeralVariants}
                      className={`block font-heading text-[5rem] leading-none font-extrabold tracking-[-0.05em] tabular-nums transition-colors duration-700 ease-out sm:text-[6.5rem] ${
                        isActive ? 'text-primary' : 'text-text/12'
                      }`}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </motion.span>
                  </span>
                </div>

                <motion.h3
                  variants={riseVariants}
                  className={`mt-6 font-heading text-2xl font-bold tracking-tight transition-colors duration-700 ease-out sm:text-[1.75rem] ${
                    isReached ? 'text-text' : 'text-text/50'
                  }`}
                >
                  {step.title}
                </motion.h3>
                <motion.p
                  variants={riseVariants}
                  className="mt-3 max-w-sm font-body text-lg leading-relaxed text-pretty text-text/65"
                >
                  {step.description}
                </motion.p>
              </motion.li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
