import { Flask, Quotes } from '@phosphor-icons/react'
import { motion, stagger, type Variants } from 'motion/react'
import { Badge } from '../../components/ui/Badge.tsx'
import { sampleSituation, sampleStoryPreviews } from '../../mocks/sampleStories.ts'
import { StoryPreviewCard } from '../stories/StoryPreviewCard.tsx'

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: stagger(0.09, { startDelay: 0.35 }) } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
}

const cardOffsetClassNames = ['lg:mr-6', 'lg:ml-6', 'lg:mx-3']

export function HeroStoryPreview() {
  return (
    <motion.section
      aria-labelledby="sample-stories-heading"
      initial="hidden"
      animate="visible"
      variants={listVariants}
      className="relative rounded-[2rem] bg-primary-light p-5 sm:p-7"
    >
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone="sample" icon={<Flask size={14} aria-hidden="true" />}>
          Sample stories
        </Badge>
        <h2 id="sample-stories-heading" className="font-body text-sm text-text/80">
          Illustrative examples, not real people
        </h2>
      </motion.div>

      <motion.figure
        variants={itemVariants}
        className="mt-4 flex gap-3 rounded-2xl rounded-bl-md bg-text p-4 text-surface"
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

      <motion.p
        variants={itemVariants}
        className="mt-5 mb-3 flex items-center gap-2 font-body text-xs font-semibold tracking-wide text-primary uppercase"
      >
        <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
        People who faced something similar
      </motion.p>

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
