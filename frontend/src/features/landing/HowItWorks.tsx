import { Car, CheckCircle, Path } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { staggerVariants } from '../../styles/motion.ts'
import { drawLineVariants, revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

type Step = {
  title: string
  description: string
  Visual: ComponentType
}

function DescribeVisual() {
  return (
    <div className="flex w-full max-w-[17rem] flex-col items-end gap-2.5">
      <p className="rounded-3xl rounded-br-lg bg-primary px-4 py-3 font-body text-sm leading-relaxed text-surface shadow-card">
        Rear-ended at a light. Now the trunk won’t close.
      </p>
      <p className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 font-body text-xs font-medium text-text shadow-card">
        <Car size={14} className="text-primary" aria-hidden="true" />
        2019 Honda Civic · 64,000 mi
      </p>
    </div>
  )
}

const matchReasons = ['Same make, Honda', 'Trunk will not close', 'Other driver’s insurer']

function MatchVisual() {
  return (
    <div className="w-full max-w-[17rem]">
      <p className="font-body text-xs font-semibold tracking-wide text-secondary uppercase">3 owners matched</p>
      <ul className="mt-3 flex flex-col gap-2">
        {matchReasons.map((reason, index) => (
          <li
            key={reason}
            style={{ marginLeft: `${index * 0.75}rem` }}
            className="flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 font-body text-sm shadow-card"
          >
            <CheckCircle size={16} weight="fill" className="shrink-0 text-secondary" aria-hidden="true" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OutcomeVisual() {
  return (
    <div className="w-full max-w-[17rem] rounded-2xl bg-surface p-4 font-body shadow-card">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">What they decided</p>
      <p className="mt-1 text-sm font-semibold">Body shop repair</p>
      <div className="my-3 h-px bg-border" />
      <p className="text-xs font-medium tracking-wide text-muted uppercase">How it turned out</p>
      <p className="mt-1 text-sm leading-snug">Fixed in under two weeks. The other insurer paid $4,600.</p>
    </div>
  )
}

const steps: Step[] = [
  {
    title: 'Describe your situation',
    description: 'Tell us about your car and what happened, in your own words. No jargon, no long forms.',
    Visual: DescribeVisual,
  },
  {
    title: 'Discover similar experiences',
    description: 'We find owners whose car, damage, and circumstances line up closely with yours.',
    Visual: MatchVisual,
  },
  {
    title: 'Learn what happened to others',
    description: 'See what they chose, what it cost, and how it turned out. Then decide for yourself.',
    Visual: OutcomeVisual,
  },
]

const visualToneClassNames = ['bg-secondary-light', 'bg-primary-light', 'bg-secondary-light']

const stepsVariants = staggerVariants(0.14, 0.1)

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-8 py-24 sm:py-32">
      <div className={sectionContainerClassName}>
        <SectionIntro
          id="how-it-works-title"
          eyebrow="How it works"
          title="From “what do I do now?” to “here’s what they did.”"
          description="Three steps, a few minutes, and you’re looking at real decisions from people who stood exactly where you are."
        />

        <motion.ol
          {...revealOnScroll}
          variants={stepsVariants}
          className="mt-16 grid gap-14 sm:mt-20 lg:grid-cols-3 lg:gap-10"
        >
          {steps.map(({ title, description, Visual }, index) => (
            <motion.li key={title} variants={riseVariants} className="group relative flex flex-col">
              <div className="flex items-center gap-4">
                <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full bg-surface-dark font-heading text-sm font-bold text-surface ring-8 ring-background transition-transform duration-300 ease-out group-hover:scale-105">
                  {index + 1}
                </span>
                {index < steps.length - 1 && (
                  <motion.span
                    aria-hidden="true"
                    variants={drawLineVariants}
                    className="absolute top-[1.375rem] right-[-2.5rem] left-14 hidden h-px origin-left bg-text/15 lg:block"
                  />
                )}
              </div>

              <h3 className="mt-7 font-heading text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-2.5 max-w-sm font-body text-base leading-relaxed text-text/70 lg:mb-8">{description}</p>

              {/* Fixed-ratio frame so a custom visual can replace the preview without shifting the layout. */}
              <div
                aria-hidden="true"
                className={`mt-8 flex aspect-[5/4] items-center justify-center overflow-hidden rounded-[1.75rem] p-6 transition-transform duration-500 ease-out group-hover:-translate-y-1.5 sm:aspect-[16/10] lg:mt-auto lg:aspect-[5/4] ${
                  visualToneClassNames[index]
                }`}
              >
                <Visual />
              </div>
            </motion.li>
          ))}
        </motion.ol>

        <motion.p
          {...revealOnScroll}
          variants={riseVariants}
          className="mt-14 flex items-center gap-2 font-body text-sm text-muted"
        >
          <Path size={16} className="shrink-0 text-primary" aria-hidden="true" />
          You choose what to do next. We just make sure you’re not choosing blind.
        </motion.p>
      </div>
    </section>
  )
}
