import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { fieldClassName } from '../../components/ui/fieldStyles.ts'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import type { StoryFilters, StoryPriceBand } from '../../types/story.ts'
import { priceOptions, yearOptions } from './storyOptions.tsx'

type StoryToolbarProps = {
  filters: StoryFilters
  priceCounts: Record<StoryPriceBand, number>
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
        isActive ? 'text-primary' : 'text-muted hover:text-text'
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
          : 'border-border bg-surface text-text hover:border-primary/40 hover:text-primary'
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

export function StoryToolbar({ filters, priceCounts, onChange }: StoryToolbarProps) {
  const totalCount = Object.values(priceCounts).reduce((total, count) => total + count, 0)
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
            placeholder="Search make, model, or symptom"
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

        <div role="group" aria-label="Model year" className="flex rounded-full bg-background p-1">
          <SegmentButton isActive={filters.yearMin === null} onClick={() => onChange({ yearMin: null })}>
            All<span className="hidden @md:inline"> years</span>
          </SegmentButton>
          {yearOptions.map((option) => (
            <SegmentButton
              key={option.value}
              isActive={filters.yearMin === Number(option.value)}
              onClick={() => onChange({ yearMin: Number(option.value) })}
            >
              {option.label}
            </SegmentButton>
          ))}
        </div>
      </div>

      <div
        ref={setChipsFadeElement}
        role="group"
        aria-label="Repair cost"
        className="scroll-fade-x -m-1.5 flex gap-2 overflow-x-auto p-1.5 @xl:flex-wrap @xl:overflow-visible"
      >
        <ChoiceChip isActive={filters.price === null} count={totalCount} onClick={() => onChange({ price: null })}>
          Any cost
        </ChoiceChip>
        {priceOptions.map((option) => (
          <ChoiceChip
            key={option.value}
            isActive={filters.price === option.value}
            count={priceCounts[option.value]}
            onClick={() => onChange({ price: filters.price === option.value ? null : option.value })}
          >
            {option.label}
          </ChoiceChip>
        ))}
      </div>
    </div>
  )
}
