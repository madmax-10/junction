import { MagnifyingGlass, UsersThree } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { getStoryPath } from '../../app/paths.ts'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { StoryMatch } from '../../types/story.ts'
import { StoryPreviewCard } from '../stories/StoryPreviewCard.tsx'
import { toStoryPreview } from '../stories/storyPreview.ts'

const statusClassName = 'flex items-center gap-1.5 font-body text-xs font-medium text-text/60'

export function StoryMatchList({ matches }: { matches: StoryMatch[] }) {
  const count = matches.length

  return (
    <section aria-label="Similar experiences" className="mt-3">
      <p className={statusClassName}>
        <UsersThree size={16} className="text-primary" aria-hidden="true" />
        {count} similar {count === 1 ? 'experience' : 'experiences'}
      </p>
      <motion.ul
        initial="hidden"
        animate="visible"
        variants={staggerVariants(0.08, 0.1)}
        className="-mx-1 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-0.5 pb-3"
      >
        {matches.map((match) => (
          <motion.li key={match.story.id} variants={fadeUpVariants} className="flex w-[17rem] shrink-0 snap-start">
            <StoryPreviewCard
              story={toStoryPreview(match)}
              variant="match"
              readMoreHref={getStoryPath(match.story.id)}
            />
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}

export function NoStoryMatches() {
  return (
    <p className={`${statusClassName} mt-3`}>
      <MagnifyingGlass size={16} className="text-primary" aria-hidden="true" />
      No close matches in community stories yet
    </p>
  )
}
