import { ArrowRight, Car, Eye, LockSimple, PencilSimpleLine } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { ButtonLink } from '../../components/ui/ButtonLink.tsx'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

const shareSteps = [
  { title: 'Tell it like you’d tell a friend', description: 'Chat about what happened. No writing skills needed.' },
  { title: 'We draft the post for you', description: 'Our AI turns your conversation into a clear, useful story.' },
  { title: 'Publish only when you’re ready', description: 'Review, edit, or remove anything before it goes live.' },
]

function DraftPostPreview() {
  return (
    <div className="w-full max-w-sm rotate-[1.5deg] rounded-[1.75rem] border border-border bg-surface p-6 font-body shadow-card-hover transition-transform duration-500 ease-out group-hover:rotate-0">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium">
          <Eye size={14} className="text-muted" />
          Draft · only you can see this
        </span>
        <PencilSimpleLine size={18} className="text-muted" />
      </div>
      <p className="mt-5 font-heading text-lg leading-snug font-bold tracking-tight">
        Bumper and trunk latch repaired after a rear-end hit
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
        <Car size={16} className="text-primary" />
        2019 Honda Civic · 64,000 mi
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">Decided</dt>
          <dd className="mt-1 leading-snug">Body shop repair</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">Cost</dt>
          <dd className="mt-1 leading-snug">$4,600, insurer paid</dd>
        </div>
      </dl>
      <div className="mt-6 flex items-center gap-2">
        <span className="flex-1 rounded-full bg-primary py-2.5 text-center text-sm font-semibold text-surface">
          Approve & publish
        </span>
        <span className="rounded-full border border-text/15 px-4 py-2.5 text-sm font-semibold">Edit</span>
      </div>
    </div>
  )
}

const stepsVariants = staggerVariants(0.1, 0.15)

export function ShareExperience() {
  return (
    <section aria-labelledby="share-experience-title" className="pb-24 sm:pb-32">
      <div className={sectionContainerClassName}>
        <div className="grid items-center gap-12 overflow-hidden rounded-[2.5rem] bg-primary-light px-6 py-14 sm:px-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:px-16 lg:py-20">
          <div>
            <SectionIntro
              id="share-experience-title"
              eyebrow="Share your experience"
              title="Your story could steady someone else."
              description="The stories here exist because owners took a few minutes to pay it forward. When you’re ready, yours can help the next driver."
            />

            <motion.ol {...revealOnScroll} variants={stepsVariants} className="mt-10 flex flex-col gap-5">
              {shareSteps.map((step, index) => (
                <motion.li key={step.title} variants={riseVariants} className="flex gap-4">
                  <span
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface font-heading text-xs font-bold text-primary shadow-card"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-heading text-base font-bold">{step.title}</h3>
                    <p className="mt-0.5 font-body text-sm leading-relaxed text-text/70">{step.description}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ol>

            <motion.div
              {...revealOnScroll}
              variants={riseVariants}
              className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
            >
              <ButtonLink to={paths.myStory} size="lg">
                Share your experience
                <ArrowRight
                  size={18}
                  className="transition-transform duration-200 ease-out group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </ButtonLink>
              <Link
                to={paths.chat}
                className="rounded-full font-body text-sm font-semibold text-text/80 underline decoration-text/25 underline-offset-4 outline-none transition-colors duration-200 hover:text-primary hover:decoration-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-primary-light"
              >
                Or tell the AI Companion
              </Link>
            </motion.div>
          </div>

          {/* Fixed-ratio frame so a custom visual can replace the preview without shifting the layout. */}
          <motion.div
            {...revealOnScroll}
            variants={riseVariants}
            aria-hidden="true"
            className="group flex aspect-[4/5] max-h-[34rem] w-full items-center justify-center sm:aspect-[4/3] lg:aspect-[4/5]"
          >
            <DraftPostPreview />
          </motion.div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 font-body text-sm text-muted">
          <LockSimple size={16} className="shrink-0 text-primary" aria-hidden="true" />
          Private unless you choose to share
        </p>
      </div>
    </section>
  )
}
