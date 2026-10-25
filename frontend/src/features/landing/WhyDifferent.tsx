import { Sparkle, UsersThree } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

const ownerAnswers = [
  { vehicle: '2019 Civic', text: 'Repaired at a body shop. The other driver’s insurer paid $4,600.' },
  { vehicle: '2020 Civic', text: 'Took the payout, then bought a newer car from the marketplace.' },
]

const columnVariants = staggerVariants(0.1, 0.1)

export function WhyDifferent() {
  return (
    <section aria-labelledby="why-different-title" className="relative overflow-hidden bg-surface-dark text-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-secondary/40 blur-3xl"
      />

      <div
        className={`${sectionContainerClassName} relative grid items-center gap-16 py-28 sm:py-36 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-24`}
      >
        <SectionIntro
          id="why-different-title"
          tone="inverse"
          title="Not a generic answer. A real one."
          description="Skip what usually happens. See what actually happened to drivers like you."
        />

        <motion.div
          {...revealOnScroll}
          variants={columnVariants}
          aria-label="Example: a generic answer compared with answers from similar owners"
          role="group"
          className="flex flex-col gap-4"
        >
          <motion.p
            variants={riseVariants}
            className="max-w-sm self-end rounded-3xl rounded-br-lg bg-primary px-5 py-3.5 font-body text-[0.95rem] leading-relaxed shadow-card"
          >
            <span className="sr-only">You ask: </span>
            Should I repair my Civic or take the insurance payout?
          </motion.p>

          <motion.div variants={riseVariants} className="rounded-3xl border border-surface/15 p-6">
            <p className="flex items-center gap-2 font-body text-xs font-semibold tracking-wide text-surface/50 uppercase">
              <Sparkle size={14} aria-hidden="true" />
              A typical AI answer
            </p>
            <p className="mt-3 font-body text-[0.95rem] leading-relaxed text-surface/55">
              It depends on repair costs, your car’s value, and your coverage. Consider getting several quotes before
              deciding.
            </p>
          </motion.div>

          <motion.div
            variants={riseVariants}
            className="rounded-3xl bg-surface p-6 text-text shadow-card-hover transition-transform duration-500 ease-out hover:-translate-y-1"
          >
            <p className="flex items-center gap-2 font-body text-xs font-semibold tracking-wide text-primary uppercase">
              <UsersThree size={16} aria-hidden="true" />
              What owners like you did
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {ownerAnswers.map((answer) => (
                <li key={answer.vehicle} className="rounded-2xl bg-background px-4 py-3 font-body text-sm leading-relaxed">
                  <span className="font-semibold">{answer.vehicle}</span>
                  <span className="text-muted"> · </span>
                  {answer.text}
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
