import { ArrowRight, LockSimple } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { paths } from '../../app/paths.ts'
import { SiteHeader } from '../../components/layout/SiteHeader.tsx'
import { ButtonLink } from '../../components/ui/ButtonLink.tsx'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import { HeroStoryPreview } from './HeroStoryPreview.tsx'

const introVariants = staggerVariants(0.07, 0.05)

export function LandingPage() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="min-h-svh bg-background text-text">
      <SiteHeader />

      <main className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-8 pb-20 sm:px-8 sm:pt-12 lg:min-h-[calc(100svh-5.5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:pt-4 lg:pb-16">
        <motion.div initial="hidden" animate="visible" variants={introVariants} className="max-w-xl">
          <motion.p
            variants={fadeUpVariants}
            className="font-body text-sm font-semibold tracking-wide text-primary uppercase"
          >
            For the days after a car accident
          </motion.p>

          <motion.h1
            variants={fadeUpVariants}
            className="mt-5 font-heading text-[2.75rem] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl xl:text-[4.25rem]"
          >
            Someone’s been through this{' '}
            <span className="relative inline-block whitespace-nowrap text-primary">
              before.
              <svg
                aria-hidden="true"
                viewBox="0 0 220 16"
                preserveAspectRatio="none"
                fill="none"
                className="absolute -bottom-1.5 left-0 h-3 w-full text-accent sm:-bottom-2"
              >
                <motion.path
                  d="M4 11C58 4.5 132 3.5 216 8"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  initial={{ pathLength: prefersReducedMotion ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUpVariants}
            className="mt-7 max-w-lg font-body text-lg leading-relaxed text-text/75"
          >
            Tell us what happened. We’ll connect you with people whose accidents looked like yours,
            so you can see what they decided, how it turned out, and what they learned.
          </motion.p>

          <motion.div
            variants={fadeUpVariants}
            className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5"
          >
            <ButtonLink to={paths.intake} size="lg">
              Find stories like mine
              <ArrowRight
                size={18}
                className="transition-transform duration-200 ease-out group-hover:translate-x-1"
                aria-hidden="true"
              />
            </ButtonLink>
            <p className="flex items-center gap-2 font-body text-sm whitespace-nowrap text-text/70">
              <LockSimple size={16} className="shrink-0 text-primary" aria-hidden="true" />
              Private unless you choose to share
            </p>
          </motion.div>
        </motion.div>

        <HeroStoryPreview />
      </main>
    </div>
  )
}
