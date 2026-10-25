import { ArrowRight } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { paths } from '../../app/paths.ts'
import { ButtonLink } from '../../components/ui/ButtonLink.tsx'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'

const ctaVariants = staggerVariants(0.1)

export function FinalCta() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section aria-labelledby="final-cta-title" className="pb-24 sm:pb-32">
      <motion.div
        {...revealOnScroll}
        variants={ctaVariants}
        className={`${sectionContainerClassName} flex flex-col items-center text-center`}
      >
        <motion.h2
          id="final-cta-title"
          variants={riseVariants}
          className="max-w-3xl font-heading text-[2.4rem] leading-[1.06] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl"
        >
          Whatever happened, you don’t have to figure it out{' '}
          <span className="relative inline-block whitespace-nowrap text-primary">
            alone.
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
                variants={{
                  hidden: { pathLength: prefersReducedMotion ? 1 : 0 },
                  visible: { pathLength: 1, transition: { duration: 0.6, delay: 0.5, ease: 'easeOut' } },
                }}
              />
            </svg>
          </span>
        </motion.h2>

        <motion.p variants={riseVariants} className="mt-7 max-w-lg font-body text-lg leading-relaxed text-text/70">
          Start with a few details. In minutes, you’ll see what people in your exact spot decided, and how it went.
        </motion.p>

        <motion.div
          variants={riseVariants}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
        >
          <ButtonLink to={paths.intake} size="lg">
            Find stories like mine
            <ArrowRight
              size={18}
              className="transition-transform duration-200 ease-out group-hover:translate-x-1"
              aria-hidden="true"
            />
          </ButtonLink>
          <ButtonLink to={paths.stories} variant="secondary" size="lg">
            Browse community stories
          </ButtonLink>
        </motion.div>
      </motion.div>
    </section>
  )
}
