import { ChatsCircle, CheckCircle, ClockCounterClockwise, LockSimple, PencilSimple } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { Badge } from '../../components/ui/Badge.tsx'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { getIntakeHighlights } from '../intake/intakeHighlights.ts'
import { getOptionLabel, interestOptions } from '../intake/intakeOptions.tsx'

const benefits = [
  { icon: <LockSimple size={18} />, text: 'Private unless you choose to share' },
  { icon: <ChatsCircle size={18} />, text: 'A guide to help you weigh repairing, selling, or replacing' },
  { icon: <ClockCounterClockwise size={18} />, text: 'Pick up your conversation where you left off' },
]

export function AuthRecap({ className = '' }: { className?: string }) {
  const { draft } = useIntakeDraft()
  const highlights = getIntakeHighlights(draft)
  const interests = draft.interests
    .map((interest) => getOptionLabel(interestOptions, interest))
    .filter((label): label is string => Boolean(label))
  const hasAnswers = highlights.length > 0 || interests.length > 0

  return (
    <motion.section
      aria-labelledby="recap-title"
      initial="hidden"
      animate="visible"
      variants={staggerVariants(0.07, 0.15)}
      className={`rounded-[1.75rem] bg-secondary-light p-6 sm:p-8 ${className}`}
    >
      <motion.p
        variants={fadeUpVariants}
        className="flex items-center gap-2 font-body text-sm font-semibold text-primary"
      >
        <CheckCircle size={18} aria-hidden="true" />
        {hasAnswers ? 'Your answers are saved' : 'Almost there'}
      </motion.p>
      <motion.h2
        variants={fadeUpVariants}
        id="recap-title"
        className="mt-4 font-heading text-3xl leading-[1.08] font-extrabold tracking-[-0.03em] text-balance sm:text-4xl"
      >
        You’re one step away from stories like yours.
      </motion.h2>

      {hasAnswers && (
        <motion.div variants={fadeUpVariants} className="mt-6 rounded-2xl bg-surface p-5 shadow-card">
          {highlights.length > 0 && (
            <>
              <p className="font-body text-xs font-semibold tracking-wide text-text/55 uppercase">
                Your situation
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <li key={highlight}>
                    <Badge>{highlight}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
          {interests.length > 0 && (
            <>
              <p
                className={`font-body text-xs font-semibold tracking-wide text-text/55 uppercase ${
                  highlights.length > 0 ? 'mt-5' : ''
                }`}
              >
                You want to hear from
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {interests.map((interest) => (
                  <li key={interest} className="flex items-start gap-2 font-body text-sm">
                    <CheckCircle size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    {interest}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link
            to={paths.intake}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full font-body text-sm font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            <PencilSimple size={16} aria-hidden="true" />
            Edit answers
          </Link>
        </motion.div>
      )}

      <motion.ul variants={fadeUpVariants} className="mt-6 space-y-3">
        {benefits.map((benefit) => (
          <li key={benefit.text} className="flex items-start gap-3 font-body text-sm text-text/80">
            <span className="mt-px shrink-0 text-secondary" aria-hidden="true">
              {benefit.icon}
            </span>
            {benefit.text}
          </li>
        ))}
      </motion.ul>
    </motion.section>
  )
}
