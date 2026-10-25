import { MagnifyingGlass, UsersThree } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { Badge } from '../../components/ui/Badge.tsx'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { StoryPreview } from '../../types/story.ts'
import { StoryPreviewCard } from '../stories/StoryPreviewCard.tsx'

type ExperiencePanelProps = {
  stories: StoryPreview[]
  resultsKey: string | null
  isSearching: boolean
}

const placeholderCards = [0, 1, 2]
const panelTransition = { duration: 0.25, ease: 'easeOut' } as const

function PlaceholderCards({ isPulsing }: { isPulsing: boolean }) {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {placeholderCards.map((card) => (
        <li
          key={card}
          style={{ opacity: 1 - card * 0.25 }}
          className={`rounded-2xl border border-dashed border-primary/25 bg-surface/60 p-4 ${
            isPulsing ? 'motion-safe:animate-pulse' : ''
          }`}
        >
          <div className="h-3 w-2/3 rounded-full bg-primary/15" />
          <div className="mt-2.5 h-2.5 w-1/2 rounded-full bg-primary/10" />
          <div className="mt-4 h-2.5 w-5/6 rounded-full bg-primary/10" />
        </li>
      ))}
    </ul>
  )
}

export function ExperiencePanel({ stories, resultsKey, isSearching }: ExperiencePanelProps) {
  const hasStories = stories.length > 0

  return (
    <aside
      aria-labelledby="experiences-title"
      className="hidden min-h-0 flex-col overflow-hidden rounded-[1.75rem] bg-primary-light lg:flex"
    >
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="experiences-title" className="font-heading text-lg font-bold tracking-tight">
            Community experiences
          </h2>
          <Badge tone="sample">Samples</Badge>
        </div>
        <p className="mt-1 font-body text-sm leading-snug text-text/65">
          {hasStories
            ? 'People whose situations look like yours.'
            : 'Stories from owners in similar spots will appear here.'}
        </p>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-5" aria-live="polite" aria-busy={isSearching}>
        <AnimatePresence mode="wait" initial={false}>
          {isSearching ? (
            <motion.div
              key="searching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={panelTransition}
            >
              <p className="mb-3 flex items-center gap-2 font-body text-sm font-medium text-primary">
                <MagnifyingGlass size={16} aria-hidden="true" />
                Searching community stories…
              </p>
              <PlaceholderCards isPulsing />
            </motion.div>
          ) : hasStories ? (
            <motion.ul
              key={resultsKey}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, transition: panelTransition }}
              variants={staggerVariants(0.08)}
              className="flex flex-col gap-3"
            >
              {stories.map((story) => (
                <motion.li key={story.id} variants={fadeUpVariants}>
                  <StoryPreviewCard story={story} variant="compact" />
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={panelTransition}
            >
              <PlaceholderCards isPulsing={false} />
              <p className="mt-5 flex gap-2 font-body text-sm leading-snug text-text/65">
                <UsersThree size={18} className="mt-px shrink-0 text-primary" aria-hidden="true" />
                As you describe what happened, we’ll pull up stories from people who faced
                something similar.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
