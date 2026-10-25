import { ArrowUpRight } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'

type FollowUpChipsProps = {
  questions: string[]
  onSelect: (question: string) => void
}

export function FollowUpChips({ questions, onSelect }: FollowUpChipsProps) {
  return (
    <motion.ul
      aria-label="Suggested follow-up questions"
      initial="hidden"
      animate="visible"
      variants={staggerVariants(0.06, 0.15)}
      className="mt-3 flex flex-wrap gap-2"
    >
      {questions.map((question) => (
        <motion.li key={question} variants={fadeUpVariants}>
          <button
            type="button"
            onClick={() => onSelect(question)}
            className="group inline-flex items-center gap-1.5 rounded-full border border-secondary/25 bg-surface px-3.5 py-2 text-left font-body text-sm font-medium text-secondary transition-[background-color,border-color] duration-200 ease-out outline-none hover:border-secondary/60 hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary active:scale-[0.98]"
          >
            {question}
            <ArrowUpRight
              size={14}
              weight="bold"
              className="shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
          </button>
        </motion.li>
      ))}
    </motion.ul>
  )
}
