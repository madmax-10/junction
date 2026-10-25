import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants } from './landingMotion.ts'

type SectionIntroProps = {
  id: string
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  tone?: 'default' | 'inverse'
  align?: 'start' | 'center'
  className?: string
}

const introVariants = staggerVariants(0.08)

export function SectionIntro({
  id,
  eyebrow,
  title,
  description,
  tone = 'default',
  align = 'start',
  className = '',
}: SectionIntroProps) {
  const isInverse = tone === 'inverse'
  const isCentered = align === 'center'

  return (
    <motion.div
      {...revealOnScroll}
      variants={introVariants}
      className={`max-w-2xl ${isCentered ? 'mx-auto text-center' : ''} ${className}`}
    >
      <motion.p
        variants={riseVariants}
        className={`flex items-center gap-2 font-body text-sm font-semibold tracking-wide uppercase ${
          isCentered ? 'justify-center' : ''
        } ${isInverse ? 'text-accent' : 'text-primary'}`}
      >
        <span className={`size-1.5 rounded-full ${isInverse ? 'bg-surface/60' : 'bg-accent'}`} aria-hidden="true" />
        {eyebrow}
      </motion.p>
      <motion.h2
        id={id}
        variants={riseVariants}
        className="mt-4 font-heading text-[2.15rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl"
      >
        {title}
      </motion.h2>
      {description && (
        <motion.p
          variants={riseVariants}
          className={`mt-5 font-body text-lg leading-relaxed text-pretty ${isInverse ? 'text-surface/70' : 'text-text/70'} ${
            isCentered ? 'mx-auto max-w-xl' : 'max-w-xl'
          }`}
        >
          {description}
        </motion.p>
      )}
    </motion.div>
  )
}
