import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { fadeUpVariants } from '../../styles/motion.ts'

type IntakeQuestionProps = {
  number: number
  title: string
  hint?: string
  children: ReactNode
}

export function IntakeQuestion({ number, title, hint, children }: IntakeQuestionProps) {
  return (
    <motion.fieldset variants={fadeUpVariants} className="min-w-0">
      <legend className="flex items-baseline gap-3">
        <span className="font-body text-sm font-semibold text-primary tabular-nums" aria-hidden="true">
          0{number}
        </span>
        <span className="font-heading text-lg font-bold tracking-tight sm:text-xl">{title}</span>
        {hint && <span className="font-body text-sm text-muted">{hint}</span>}
      </legend>
      <div className="mt-4">{children}</div>
    </motion.fieldset>
  )
}
