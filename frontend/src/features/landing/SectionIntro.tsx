import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants } from './landingMotion.ts'

type SectionIntroProps = {
  id: string
  title: ReactNode
  description?: ReactNode
  tone?: 'default' | 'inverse'
  align?: 'start' | 'center'
  className?: string
}

const introVariants = staggerVariants(0.08)

export function SectionIntro({
  id,
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
      <motion.h2
        id={id}
        variants={riseVariants}
        className="font-heading text-[2.15rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl"
      >
        {title}
      </motion.h2>
      {description && (
        <motion.p
          variants={riseVariants}
          className={`mt-6 max-w-lg font-body text-lg leading-relaxed text-pretty ${
            isInverse ? 'text-surface/70' : 'text-text/70'
          } ${isCentered ? 'mx-auto' : ''}`}
        >
          {description}
        </motion.p>
      )}
    </motion.div>
  )
}
