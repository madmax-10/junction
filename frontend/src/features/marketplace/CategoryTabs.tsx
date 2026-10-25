import { motion } from 'motion/react'
import type { ListingCategory } from '../../types/marketplace.ts'
import { categoryOptions } from './marketplaceOptions.tsx'

type CategoryTabsProps = {
  category: ListingCategory
  counts: Record<ListingCategory, number>
  onChange: (category: ListingCategory) => void
}

const pillTransition = { type: 'spring', bounce: 0.15, duration: 0.35 } as const

export function CategoryTabs({ category, counts, onChange }: CategoryTabsProps) {
  return (
    <div role="group" aria-label="Browse" className="grid grid-cols-2 gap-1.5 rounded-[1.25rem] bg-background p-1.5">
      {categoryOptions.map((option) => {
        const isActive = option.value === category
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`group relative flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4 sm:py-3 ${
              isActive ? 'text-text' : 'text-text/65 hover:text-text'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="marketplace-category-pill"
                transition={pillTransition}
                className="absolute inset-0 rounded-2xl bg-surface shadow-card"
                aria-hidden="true"
              />
            )}
            <span
              className={`relative hidden size-10 shrink-0 place-items-center rounded-xl transition-colors duration-200 @md:grid ${
                isActive ? 'bg-primary-light text-primary' : 'bg-surface/70 text-text/50 group-hover:text-text/70'
              }`}
              aria-hidden="true"
            >
              {option.icon}
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate font-heading text-sm font-bold tracking-tight sm:text-base">{option.label}</span>
                <span className={`font-body text-xs font-medium tabular-nums ${isActive ? 'text-primary' : 'text-text/45'}`}>
                  <span className="sr-only">(</span>
                  {counts[option.value]}
                  <span className="sr-only"> listings)</span>
                </span>
              </span>
              <span className="mt-0.5 hidden truncate font-body text-xs text-text/60 @xl:block">{option.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
