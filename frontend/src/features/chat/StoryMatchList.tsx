import { CaretDown, MagnifyingGlass, UsersThree } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { getStoryPath } from '../../app/paths.ts'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint, fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { StoryMatch } from '../../types/story.ts'
import { StoryPreviewCard } from '../stories/StoryPreviewCard.tsx'
import { toStoryPreview } from '../stories/storyPreview.ts'

const statusClassName = 'flex items-center gap-1.5 font-body text-xs font-medium text-text/60'
const collapseTransition = { duration: 0.3, ease: easeOutQuint }

type StoryMatchListProps = {
  id: string
  matches: StoryMatch[]
  isLatest: boolean
}

// Only the latest reply keeps its stories open, so earlier turns fold away unless reopened.
export function StoryMatchList({ id, matches, isLatest }: StoryMatchListProps) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null)
  const setFadeElement = useScrollFade<HTMLUListElement>({ axis: 'x' })
  const isOpen = openOverride ?? isLatest
  const count = matches.length
  const listId = `${id}-list`

  return (
    <section aria-label="Similar experiences" className="mt-3">
      <button
        type="button"
        onClick={() => setOpenOverride(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={listId}
        className={`${statusClassName} group -mx-2 rounded-full px-2 py-1 transition-colors duration-200 outline-none hover:bg-background hover:text-text focus-visible:ring-2 focus-visible:ring-primary`}
      >
        <UsersThree size={16} className="text-primary" aria-hidden="true" />
        {count} similar {count === 1 ? 'experience' : 'experiences'}
        <CaretDown
          size={12}
          weight="bold"
          className={`transition-transform duration-200 ease-out ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="matches"
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={collapseTransition}
            className="-mx-1 overflow-hidden px-1"
          >
            <motion.ul
              ref={setFadeElement}
              initial="hidden"
              animate="visible"
              variants={staggerVariants(0.08, 0.1)}
              className="scroll-fade-x -mx-1 mt-1.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-0.5 pb-3"
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
          </motion.div>
        )}
      </AnimatePresence>
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
