import { LockSimple } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import { IntakeProgress } from './IntakeProgress.tsx'

export const intakeTotalSteps = 3

type IntakeStepLayoutProps = {
  step: number
  title: string
  description: string
  children: ReactNode
}

export function IntakeStepLayout({ step, title, description, children }: IntakeStepLayoutProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
      <motion.header
        initial="hidden"
        animate="visible"
        variants={staggerVariants(0.07, 0.05)}
        className="lg:sticky lg:top-10 lg:self-start"
      >
        <motion.div variants={fadeUpVariants}>
          <IntakeProgress currentStep={step} totalSteps={intakeTotalSteps} />
        </motion.div>
        <motion.h1
          variants={fadeUpVariants}
          className="mt-6 font-heading text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl"
        >
          {title}
        </motion.h1>
        <motion.p
          variants={fadeUpVariants}
          className="mt-5 max-w-sm font-body text-lg leading-relaxed text-text/75"
        >
          {description}
        </motion.p>
        <motion.p
          variants={fadeUpVariants}
          className="mt-6 flex items-center gap-2 font-body text-sm text-muted"
        >
          <LockSimple size={16} className="shrink-0 text-primary" aria-hidden="true" />
          Private unless you choose to share
        </motion.p>
      </motion.header>

      {children}
    </div>
  )
}
