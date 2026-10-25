import { ArrowUpRight, ChatCircleText } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { exampleQuestions } from './chatExamples.tsx'

type ChatEmptyStateProps = {
  onSelectExample: (text: string) => void
}

export function ChatEmptyState({ onSelectExample }: ChatEmptyStateProps) {
  const { user } = useAuth()
  const { draft } = useIntakeDraft()
  const ownQuestion = draft.question.trim()
  const firstName = user?.name.split(' ')[0]

  const suggestions = ownQuestion
    ? [
        { id: 'own-question', text: ownQuestion, icon: <ChatCircleText size={18} />, isOwn: true },
        ...exampleQuestions.slice(0, 3).map((question) => ({ ...question, isOwn: false })),
      ]
    : exampleQuestions.map((question) => ({ ...question, isOwn: false }))

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerVariants(0.07, 0.1)}
      className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-2"
    >
      <motion.h2
        variants={fadeUpVariants}
        className="font-heading text-xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-2xl"
      >
        {firstName ? `Hi ${firstName}, what would you like to know?` : 'What would you like to know?'}
      </motion.h2>
      <motion.p variants={fadeUpVariants} className="mt-1.5 max-w-lg font-body text-sm leading-relaxed text-muted">
        Ask about your situation or add photos of the damage. I’ll find people who went through
        something similar.
      </motion.p>

      <motion.p
        variants={fadeUpVariants}
        id="example-questions-label"
        className="mt-6 font-body text-xs font-semibold tracking-wide text-text/55 uppercase"
      >
        Try asking
      </motion.p>
      <motion.ul
        variants={staggerVariants(0.06)}
        aria-labelledby="example-questions-label"
        className="mt-2.5 grid gap-2.5 sm:grid-cols-2"
      >
        {suggestions.map((suggestion) => (
          <motion.li key={suggestion.id} variants={fadeUpVariants}>
            <button
              type="button"
              onClick={() => onSelectExample(suggestion.text)}
              className={`group flex h-full w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-[border-color,box-shadow,transform] duration-200 ease-out outline-none hover:-translate-y-0.5 hover:shadow-card focus-visible:ring-1 active:translate-y-0 ${
                suggestion.isOwn
                  ? 'border-primary/30 bg-primary-light/40 hover:border-primary/35 focus-visible:border-primary focus-visible:ring-primary'
                  : 'border-border bg-surface hover:border-secondary/35 focus-visible:border-secondary focus-visible:ring-secondary'
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl transition-colors duration-200 group-hover:text-surface ${
                  suggestion.isOwn
                    ? 'bg-primary-light text-primary group-hover:bg-primary'
                    : 'bg-secondary-light text-secondary group-hover:bg-secondary'
                }`}
                aria-hidden="true"
              >
                {suggestion.icon}
              </span>
              <span className="min-w-0 flex-1">
                {suggestion.isOwn && (
                  <span className="mb-1 block font-body text-xs font-semibold text-primary">
                    Your question
                  </span>
                )}
                <span className="block font-body text-sm leading-snug break-words">{suggestion.text}</span>
              </span>
              <ArrowUpRight
                size={16}
                weight="bold"
                className={`mt-0.5 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 ${
                  suggestion.isOwn ? 'text-primary' : 'text-secondary'
                }`}
                aria-hidden="true"
              />
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  )
}
