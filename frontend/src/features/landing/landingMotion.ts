import type { Variants } from 'motion/react'
import { easeOutQuint } from '../../styles/motion.ts'

export const sectionContainerClassName = 'mx-auto w-full max-w-6xl px-6 sm:px-8'

export const revealOnScroll = {
  initial: 'hidden',
  whileInView: 'visible',
  viewport: { once: true, amount: 0.2 },
} as const

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOutQuint } },
}