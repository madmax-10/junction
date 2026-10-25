import { stagger, type Variants } from 'motion/react'

export const easeOutQuint = [0.22, 1, 0.36, 1] as const

export function staggerVariants(interval: number, startDelay = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { delayChildren: stagger(interval, { startDelay }) } },
  }
}

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeOutQuint } },
}
