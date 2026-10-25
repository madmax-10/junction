import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { fieldClassName } from '../../components/ui/fieldStyles.ts'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import type { StoryChoice, StoryFilters } from '../../types/story.ts'
import { bodyStyleOptions, choiceOptions } from './storyOptions.tsx'

type StoryToolbarProps = {
  filters: StoryFilters
  choiceCounts: Record<StoryChoice, number>
  onChange: (changes: Partial<StoryFilters>) => void
}

const pillTransition = { type: 'spring', bounce: 0.15, duration: 0.35 } as const

function SegmentButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`relative h-9 flex-1 rounded-full px-3 font-body text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary @3xl:flex-none ${
        isActive ? 'text-primary' : 'text-text/65 hover:text-text'
      }`}
    >
      {isActive && (
        <motion.span
          layoutId="story-vehicle-pill"
          transition={pillTransition}
          className="absolute inset-0 rounded-full bg-surface shadow-card"
          aria-hidden="true"
        />
      )}
      <span className="relative">{children}</span>
    </button>
  )
}

function ChoiceChip({
  isActive,
  count,
  onClick,
  children,
}: {
  isActive: boolean
  count: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 font-body text-sm font-medium transition-[background-color,border-color,color] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98] ${
        isActive
          ? 'border-primary bg-primary text-surface'
          : 'border-text/10 bg-surface text-text hover:border-primary/40 hover:text-primary'
      }`}
    >
      {children}
      <span className={`tabular-nums ${isActive ? 'text-surface/70' : 'text-text/45'}`}>
        <span className="sr-only">(</span>
        {count}
        <span className="sr-only"> stories)</span>
      </span>
    </button>
  )
}

export function StoryToolbar({ filters, choiceCounts, onChange }: StoryToolbarProps) {
  const totalCount = Object.values(choiceCounts).reduce((total, count) => total + count, 0)
  const setChipsFadeElement = useScrollFade<HTMLDivElement>({ axis: 'x' })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center">
        <div role="search" className="relative flex-1">
          <label htmlFor="story-search" className="sr-only">
            Search stories
          </label>
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text/45"
            aria-hidden="true"
          />
          <input
            id="story-search"
            type="search"
            autoComplete="off"
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Search by car, damage, or decision"
            className={`${fieldClassName} h-11 pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden`}
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => onChange({ query: '' })}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-text/55 transition-colors duration-200 outline-none hover:bg-background hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={14} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>

        <div role="group" aria-label="Vehicle type" className="flex rounded-full bg-background p-1">
          <SegmentButton isActive={filters.bodyStyle === null} onClick={() => onChange({ bodyStyle: null })}>
            All<span className="hidden @md:inline"> vehicles</span>
          </SegmentButton>
          {bodyStyleOptions.map((option) => (
            <SegmentButton
              key={option.value}
              isActive={filters.bodyStyle === option.value}
              onClick={() => onChange({ bodyStyle: option.value })}
            >
              {option.label}
            </SegmentButton>
          ))}
        </div>
      </div>

      <div
        ref={setChipsFadeElement}
        role="group"
        aria-label="What the owner decided"
        className="scroll-fade-x -m-1.5 flex gap-2 overflow-x-auto p-1.5 @xl:flex-wrap @xl:overflow-visible"
      >
        <ChoiceChip isActive={filters.choice === null} count={totalCount} onClick={() => onChange({ choice: null })}>
          All decisions
        </ChoiceChip>
        {choiceOptions.map((option) => (
          <ChoiceChip
            key={option.value}
            isActive={filters.choice === option.value}
            count={choiceCounts[option.value]}
            onClick={() => onChange({ choice: filters.choice === option.value ? null : option.value })}
          >
            {option.icon}
            {option.label}
          </ChoiceChip>
        ))}
      </div>
    </div>
  )
}
