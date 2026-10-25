import { ArrowCounterClockwise, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getStoryPath, paths } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { StatusMessage } from '../../components/ui/StatusMessage.tsx'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint, fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { StoryFilters } from '../../types/story.ts'
import { CommunityStoryCard } from './CommunityStoryCard.tsx'
import { countByPrice, emptyStoryFilters, filterStories, hasActiveFilters } from './storyFilters.ts'
import { StoryToolbar } from './StoryToolbar.tsx'
import { useCommunityStories } from './useCommunityStories.ts'

const pageTransition = { duration: 0.35, ease: easeOutQuint }
const layoutTransition = { duration: 0.3, ease: easeOutQuint }
const placeholderCards = [0, 1, 2, 3]

function LoadingCards() {
  return (
    <ul aria-hidden="true" className="grid gap-4 @2xl:grid-cols-2">
      {placeholderCards.map((card) => (
        <li key={card} className="rounded-2xl border border-border p-5 motion-safe:animate-pulse">
          <div className="h-3 w-1/3 rounded-full bg-text/[0.06]" />
          <div className="mt-4 h-4 w-2/3 rounded-full bg-text/[0.08]" />
          <div className="mt-2.5 h-3 w-1/2 rounded-full bg-text/[0.06]" />
          <div className="mt-5 h-3 w-full rounded-full bg-text/[0.06]" />
          <div className="mt-2 h-3 w-5/6 rounded-full bg-text/[0.06]" />
          <div className="mt-5 h-16 rounded-xl bg-background/70" />
        </li>
      ))}
    </ul>
  )
}

export function StoriesPage() {
  const { status, stories, retry } = useCommunityStories()
  const { storyId } = useParams()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<StoryFilters>(emptyStoryFilters)
  // The toolbar sticks to the top while scrolling, so only the bottom edge fades.
  const setFadeElement = useScrollFade<HTMLDivElement>({ fadeStart: false })

  const visibleStories = useMemo(() => filterStories(stories, filters), [stories, filters])
  const priceCounts = useMemo(() => countByPrice(stories, filters), [stories, filters])
  const isFiltered = hasActiveFilters(filters)

  function updateFilters(changes: Partial<StoryFilters>) {
    setFilters((current) => ({ ...current, ...changes }))
  }

  function toggleStory(id: string) {
    navigate(id === storyId ? paths.stories : getStoryPath(id), { replace: true })
  }

  const clearFiltersButton = (
    <Button variant="secondary" onClick={() => setFilters(emptyStoryFilters)}>
      <ArrowCounterClockwise size={16} aria-hidden="true" />
      Clear filters
    </Button>
  )

  return (
    <motion.section
      aria-labelledby="stories-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={pageTransition}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-card"
    >
      <div ref={setFadeElement} className="scroll-fade-y @container min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="px-5 pt-6 sm:px-8 sm:pt-8">
          <h1 id="stories-title" className="font-heading text-2xl font-extrabold tracking-[-0.02em] sm:text-[1.75rem]">
            Community Stories
          </h1>
        </header>

        <div className="z-10 border-b @3xl:sticky @3xl:top-0 border-border bg-surface px-5 pt-5 pb-4 sm:px-8">
          <StoryToolbar filters={filters} priceCounts={priceCounts} onChange={updateFilters} />
        </div>

        <div className="px-5 pt-4 pb-6 sm:px-8 sm:pb-8" aria-busy={status === 'loading'}>
          {status === 'loading' && <LoadingCards />}

          {status === 'error' && (
            <StatusMessage
              icon={<WarningCircle size={26} weight="duotone" />}
              title="Couldn’t load community stories"
              description="Something went wrong while fetching stories. Please try again."
              action={
                <Button variant="secondary" onClick={retry}>
                  <ArrowCounterClockwise size={16} aria-hidden="true" />
                  Try again
                </Button>
              }
            />
          )}

          {status === 'ready' && (
            <>
              <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
                <p aria-live="polite" className="font-body text-sm text-muted">
                  {isFiltered
                    ? `Showing ${visibleStories.length} of ${stories.length} stories`
                    : `${stories.length} stories`}
                </p>
                {isFiltered && visibleStories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters(emptyStoryFilters)}
                    className="rounded-full px-2.5 py-1 font-body text-sm font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {visibleStories.length === 0 ? (
                <StatusMessage
                  icon={<MagnifyingGlass size={26} weight="duotone" />}
                  title="No stories match yet"
                  description="Try a different search, or widen the decision and vehicle filters."
                  action={clearFiltersButton}
                />
              ) : (
                <motion.ul
                  initial="hidden"
                  animate="visible"
                  variants={staggerVariants(0.06)}
                  className="relative grid grid-flow-row-dense gap-4 @2xl:grid-cols-2"
                >
                  <AnimatePresence mode="popLayout">
                    {visibleStories.map((story) => {
                      const isExpanded = story.id === storyId
                      return (
                        <motion.li
                          key={story.id}
                          layout="position"
                          variants={fadeUpVariants}
                          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                          transition={{ layout: layoutTransition }}
                          className={isExpanded ? '@2xl:col-span-2' : ''}
                        >
                          <CommunityStoryCard
                            story={story}
                            isExpanded={isExpanded}
                            onToggle={() => toggleStory(story.id)}
                          />
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </motion.ul>
              )}
            </>
          )}
        </div>
      </div>
    </motion.section>
  )
}
