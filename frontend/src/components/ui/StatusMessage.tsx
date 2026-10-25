import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { easeOutQuint } from '../../styles/motion.ts'

type StatusMessageProps = {
  icon: ReactNode
  title: string
  description: string
  action: ReactNode
}

export function StatusMessage({ icon, title, description, action }: StatusMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: easeOutQuint }}
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-light text-primary" aria-hidden="true">
        {icon}
      </span>
      <h2 className="mt-4 font-heading text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-sm font-body text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-5">{action}</div>
    </motion.div>
  )
}
