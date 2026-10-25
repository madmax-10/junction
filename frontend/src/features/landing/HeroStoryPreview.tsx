import { Quotes } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { sampleSituation, sampleStoryPreviews } from '../../mocks/sampleStories.ts'
import { fadeUpVariants as itemVariants, staggerVariants } from '../../styles/motion.ts'
import { StoryPreviewCard } from '../stories/StoryPreviewCard.tsx'

const listVariants = staggerVariants(0.09, 0.35)

const cardOffsetClassNames = ['lg:mr-6', 'lg:ml-6', 'lg:mx-3']

export function HeroStoryPreview() {
  return (
    <motion.section
      aria-labelledby="hero-stories-heading"
      initial="hidden"
      animate="visible"
      variants={listVariants}
      className="relative rounded-[2rem] bg-secondary-light p-5 sm:p-7"
    >
      <motion.figure
        variants={itemVariants}
        className="flex gap-3 rounded-2xl rounded-bl-md bg-surface-dark p-4 text-surface"
      >
        <Quotes size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <figcaption className="font-body text-xs font-medium text-surface/70">
            A situation like yours
          </figcaption>
          <blockquote className="mt-1 font-body text-sm leading-relaxed">
            {sampleSituation.description}
          </blockquote>
        </div>
      </motion.figure>

      <motion.h2
        id="hero-stories-heading"
        variants={itemVariants}
        className="mt-5 mb-3 flex items-center gap-2 font-body text-xs font-semibold tracking-wide text-primary uppercase"
      >
        <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
        People who faced something similar
      </motion.h2>

      <ul className="flex flex-col gap-3">
        {sampleStoryPreviews.map((story, index) => (
          <motion.li
            key={story.id}
            variants={itemVariants}
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cardOffsetClassNames[index % cardOffsetClassNames.length]}
          >
            <StoryPreviewCard story={story} variant={index === 0 ? 'full' : 'compact'} />
          </motion.li>
        ))}
      </ul>
    </motion.section>
  )
}
