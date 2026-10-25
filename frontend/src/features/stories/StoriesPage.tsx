import { ArrowCounterClockwise, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getStoryPath, paths } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { easeOutQuint, fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { StoryFilters } from '../../types/story.ts'
import { CommunityStoryCard } from './CommunityStoryCard.tsx'
import { countByChoice, emptyStoryFilters, filterStories, hasActiveFilters } from './storyFilters.ts'
import { StoryToolbar } from './StoryToolbar.tsx'
import { useCommunityStories } from './useCommunityStories.ts'

const pageTransition = { duration: 0.35, ease: easeOutQuint }
const layoutTransition = { duration: 0.3, ease: easeOutQuint }
const placeholderCards = [0, 1, 2, 3]

function StatusMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={pageTransition}
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-light text-primary" aria-hidden="true">
        {icon}
      </span>
      <h2 className="mt-4 font-heading text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-sm font-body text-sm leading-relaxed text-text/65">{description}</p>
      <div className="mt-5">{action}</div>
    </motion.div>
  )
}

function LoadingCards() {
  return (
    <ul aria-hidden="true" className="grid gap-4 @2xl:grid-cols-2">
      {placeholderCards.map((card) => (
        <li key={card} className="rounded-2xl border border-text/[0.06] p-5 motion-safe:animate-pulse">
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

  const visibleStories = useMemo(() => filterStories(stories, filters), [stories, filters])
  const choiceCounts = useMemo(() => countByChoice(stories, filters), [stories, filters])
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
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-text/[0.06] bg-surface shadow-card"
    >
      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="px-5 pt-6 sm:px-8 sm:pt-8">
          <div className="max-w-xl">
            <h1 id="stories-title" className="font-heading text-2xl font-extrabold tracking-[-0.02em] sm:text-[1.75rem]">
              Community Stories
            </h1>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-text/65">
              What other owners decided, how it turned out, and what they learned, organized into the same
              sections so stories are easy to compare.
            </p>
          </div>
        </header>

        <div className="z-10 border-b @3xl:sticky @3xl:top-0 border-text/[0.06] bg-surface px-5 pt-5 pb-4 sm:px-8">
          <StoryToolbar filters={filters} choiceCounts={choiceCounts} onChange={updateFilters} />
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
                <p aria-live="polite" className="font-body text-sm text-text/60">
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
