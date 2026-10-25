import type { ListingCategory, MarketplaceFilters, MarketplaceListing } from '../../types/marketplace.ts'
import { priceOptions } from './marketplaceOptions.tsx'

export const emptyMarketplaceFilters: MarketplaceFilters = {
  query: '',
  price: null,
  minYear: null,
  maxMileage: null,
  condition: null,
}

export function getVehicleName({ vehicle }: MarketplaceListing) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, '')
}

function matchesQuery({ vehicle }: MarketplaceListing, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const text = normalize(`${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`)
  return terms.every((term) => text.includes(term))
}

function matchesPrice(listing: MarketplaceListing, price: MarketplaceFilters['price']) {
  const range = priceOptions.find((option) => option.value === price)
  return !range || (listing.price >= range.min && listing.price < range.max)
}

export function hasActiveFilters({ query, price, minYear, maxMileage, condition }: MarketplaceFilters) {
  return query.trim() !== '' || price !== null || minYear !== null || maxMileage !== null || condition !== null
}

export function filterListings(
  listings: MarketplaceListing[],
  category: ListingCategory,
  { query, price, minYear, maxMileage, condition }: MarketplaceFilters,
) {
  return listings.filter(
    (listing) =>
      listing.category === category &&
      matchesPrice(listing, price) &&
      (minYear === null || listing.vehicle.year >= minYear) &&
      (maxMileage === null || listing.vehicle.mileage < maxMileage) &&
      (condition === null || listing.condition === condition) &&
      matchesQuery(listing, query),
  )
}

// Condition options differ per category, so category counts only apply the shared filters.
export function countByCategory(listings: MarketplaceListing[], filters: MarketplaceFilters) {
  const sharedFilters = { ...filters, condition: null }
  return {
    replacement: filterListings(listings, 'replacement', sharedFilters).length,
    damaged: filterListings(listings, 'damaged', sharedFilters).length,
  } satisfies Record<ListingCategory, number>
}
