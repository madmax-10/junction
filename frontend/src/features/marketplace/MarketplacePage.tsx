import { ArrowCounterClockwise, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getListingPath, paths } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { StatusMessage } from '../../components/ui/StatusMessage.tsx'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint, fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { ListingCategory, MarketplaceFilters } from '../../types/marketplace.ts'
import { CategoryTabs } from './CategoryTabs.tsx'
import { ListingCard } from './ListingCard.tsx'
import { ListingDetail } from './ListingDetail.tsx'
import { ListYourCarButton } from './ListYourCarButton.tsx'
import { countByCategory, emptyMarketplaceFilters, filterListings, hasActiveFilters } from './marketplaceFilters.ts'
import { MarketplaceToolbar } from './MarketplaceToolbar.tsx'
import { useMarketplaceListings } from './useMarketplaceListings.ts'

const pageTransition = { duration: 0.35, ease: easeOutQuint }
const layoutTransition = { duration: 0.3, ease: easeOutQuint }
const placeholderCards = [0, 1, 2, 3]
const gridClassName = 'grid gap-5 @xl:grid-cols-2 @5xl:grid-cols-3'

function LoadingCards() {
  return (
    <ul aria-hidden="true" className={gridClassName}>
      {placeholderCards.map((card) => (
        <li key={card} className="overflow-hidden rounded-2xl border border-border motion-safe:animate-pulse">
          <div className="aspect-[16/10] bg-text/[0.06]" />
          <div className="p-5">
            <div className="h-4 w-2/3 rounded-full bg-text/[0.08]" />
            <div className="mt-2.5 h-3 w-1/3 rounded-full bg-text/[0.06]" />
            <div className="mt-4 h-5 w-1/4 rounded-full bg-text/[0.08]" />
            <div className="mt-5 h-3 w-1/2 rounded-full bg-text/[0.06]" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MarketplacePage() {
  const { status, listings, retry } = useMarketplaceListings()
  const { listingId } = useParams()
  const navigate = useNavigate()
  const [category, setCategory] = useState<ListingCategory>('sell')
  const [filters, setFilters] = useState<MarketplaceFilters>(emptyMarketplaceFilters)
  // The toolbar sticks to the top while scrolling, so only the bottom edge fades.
  const setFadeElement = useScrollFade<HTMLDivElement>({ fadeStart: false })

  const visibleListings = useMemo(() => filterListings(listings, category, filters), [listings, category, filters])
  const categoryCounts = useMemo(() => countByCategory(listings, filters), [listings, filters])
  const categoryTotal = useMemo(
    () => listings.filter((listing) => (category === 'sell' ? listing.kind === 'sell' : true)).length,
    [listings, category],
  )
  const selectedListing = listings.find((listing) => listing.id === listingId)
  const isFiltered = hasActiveFilters(filters)

  function updateFilters(changes: Partial<MarketplaceFilters>) {
    setFilters((current) => ({ ...current, ...changes }))
  }

  function changeCategory(nextCategory: ListingCategory) {
    setCategory(nextCategory)
    updateFilters({ vehicleType: null, trim: null, location: null })
  }

  const clearFiltersButton = (
    <Button variant="secondary" onClick={() => setFilters(emptyMarketplaceFilters)}>
      <ArrowCounterClockwise size={16} aria-hidden="true" />
      Clear filters
    </Button>
  )

  return (
    <motion.section
      aria-labelledby="marketplace-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={pageTransition}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-card"
    >
      <div ref={setFadeElement} className="scroll-fade-y @container min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="flex items-center justify-between gap-4 px-5 pt-6 sm:px-8 sm:pt-8">
          <h1 id="marketplace-title" className="font-heading text-2xl font-extrabold tracking-[-0.02em] sm:text-[1.75rem]">
            Marketplace
          </h1>
          <ListYourCarButton />
        </header>

        <div className="px-5 pt-5 sm:px-8">
          <CategoryTabs category={category} counts={categoryCounts} onChange={changeCategory} />
        </div>

        <div className="z-10 border-b border-border bg-surface px-5 pt-4 pb-4 @3xl:sticky @3xl:top-0 sm:px-8">
          <MarketplaceToolbar category={category} filters={filters} onChange={updateFilters} />
        </div>

        <div className="px-5 pt-4 pb-6 sm:px-8 sm:pb-8" aria-busy={status === 'loading'}>
          {status === 'loading' && <LoadingCards />}

          {status === 'error' && (
            <StatusMessage
              icon={<WarningCircle size={26} weight="duotone" />}
              title="Couldn’t load listings"
              description="Something went wrong while fetching the marketplace. Please try again."
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
                    ? `Showing ${visibleListings.length} of ${categoryTotal} listings`
                    : `${categoryTotal} listings`}
                </p>
                {isFiltered && visibleListings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters(emptyMarketplaceFilters)}
                    className="rounded-full px-2.5 py-1 font-body text-sm font-semibold text-secondary transition-colors duration-200 outline-none hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {visibleListings.length === 0 ? (
                <StatusMessage
                  icon={<MagnifyingGlass size={26} weight="duotone" />}
                  title="No cars match yet"
                  description="Try a different make or model, or widen the price, year, mileage, and condition filters."
                  action={clearFiltersButton}
                />
              ) : (
                <motion.ul
                  key={category}
                  initial="hidden"
                  animate="visible"
                  variants={staggerVariants(0.06)}
                  className={`relative ${gridClassName}`}
                >
                  <AnimatePresence mode="popLayout">
                    {visibleListings.map((listing) => (
                      <motion.li
                        key={listing.id}
                        layout="position"
                        variants={fadeUpVariants}
                        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                        transition={{ layout: layoutTransition }}
                      >
                        <ListingCard
                          listing={listing}
                          onOpen={() => navigate(getListingPath(listing.id), { replace: true })}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </motion.ul>
              )}
            </>
          )}
        </div>
      </div>

      <ListingDetail listing={selectedListing} onClose={() => navigate(paths.marketplace, { replace: true })} />
    </motion.section>
  )
}
