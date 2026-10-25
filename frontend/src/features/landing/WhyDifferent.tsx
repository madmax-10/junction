import { Fingerprint, HandHeart, ShieldCheck, Sparkle, UsersThree, type Icon } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

type Principle = {
  icon: Icon
  title: string
  description: string
}

const principles: Principle[] = [
  {
    icon: Fingerprint,
    title: 'Matched to your details',
    description: 'Your make, model, damage, and insurance situation shape every result.',
  },
  {
    icon: HandHeart,
    title: 'Told by real owners',
    description: 'Decisions, costs, and outcomes come straight from the people who lived them.',
  },
  {
    icon: ShieldCheck,
    title: 'Yours to keep private',
    description: 'Nothing you share is published unless you review it and say yes.',
  },
]

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
        className={`${sectionContainerClassName} relative grid gap-16 py-24 sm:py-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20`}
      >
        <div>
          <SectionIntro
            id="why-different-title"
            tone="inverse"
            eyebrow="Why it’s different"
            title="Not another generic answer. Real people, real outcomes."
            description="Most tools tell you what usually happens. Our AI listens to your situation, then connects you with owners who actually faced it, so you can see what really happened next."
          />

          <motion.ul {...revealOnScroll} variants={columnVariants} className="mt-12 flex flex-col gap-7">
            {principles.map(({ icon: PrincipleIcon, title, description }) => (
              <motion.li key={title} variants={riseVariants} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface/10 text-accent">
                  <PrincipleIcon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-heading text-base font-bold">{title}</h3>
                  <p className="mt-1 max-w-sm font-body text-sm leading-relaxed text-surface/65">{description}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          {...revealOnScroll}
          variants={columnVariants}
          aria-label="Example: a generic answer compared with answers from similar owners"
          role="group"
          className="flex flex-col gap-4 self-center"
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
            <p className="mt-4 font-body text-xs text-muted">Matched on make, damage, and who’s paying.</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
