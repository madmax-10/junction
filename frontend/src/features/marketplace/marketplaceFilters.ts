import { isBuyerListing, type ListingCategory, type MarketplaceFilters, type MarketplaceListing, type VehicleListing } from '../../types/marketplace.ts'
import { priceOptions } from './marketplaceOptions.tsx'

export const emptyMarketplaceFilters: MarketplaceFilters = {
  query: '',
  price: null,
  yearMin: null,
  yearMax: null,
  location: null,
  trim: null,
  vehicleType: null,
}

export function getVehicleName({ vehicle }: VehicleListing) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, '')
}

function matchesQuery(listing: MarketplaceListing, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const text = isBuyerListing(listing)
    ? normalize(`${listing.title} ${listing.makes.join(' ')} ${listing.models.join(' ')} ${listing.fuelType ?? ''}`)
    : normalize(`${listing.vehicle.year} ${listing.vehicle.make} ${listing.vehicle.model} ${listing.vehicle.trim}`)
  return terms.every((term) => text.includes(term))
}

function matchesPrice(listing: MarketplaceListing, price: MarketplaceFilters['price']) {
  const range = priceOptions.find((option) => option.value === price)
  if (!range) return true
  if (isBuyerListing(listing)) {
    if (listing.minBudget === null && listing.maxBudget === null) return true
    const lower = listing.minBudget ?? 0
    const upper = listing.maxBudget ?? Infinity
    return upper >= range.min && lower < range.max
  }
  return listing.price >= range.min && (range.max === Infinity || listing.price < range.max)
}

function matchesYear(listing: MarketplaceListing, yearMin: number | null, yearMax: number | null) {
  if (isBuyerListing(listing)) {
    if (listing.minimumYear === null) return true
    return (yearMin === null || listing.minimumYear >= yearMin) && (yearMax === null || listing.minimumYear <= yearMax)
  }
  return (yearMin === null || listing.vehicle.year >= yearMin) && (yearMax === null || listing.vehicle.year <= yearMax)
}

// Buy a car browses cars for sale. Sell your car browses people who published a buy post.
function matchesKind(listing: MarketplaceListing, category: ListingCategory, vehicleType: MarketplaceFilters['vehicleType']) {
  if (category === 'sell') {
    return isBuyerListing(listing) && (vehicleType === null || listing.vehicleType === vehicleType)
  }
  if (vehicleType === 'used') return listing.kind === 'sell'
  if (vehicleType === 'new') return listing.kind === 'new'
  return listing.kind === 'sell' || listing.kind === 'new'
}

export function hasActiveFilters({ query, price, yearMin, yearMax, location, trim, vehicleType }: MarketplaceFilters) {
  return (
    query.trim() !== '' ||
    price !== null ||
    yearMin !== null ||
    yearMax !== null ||
    location !== null ||
    trim !== null ||
    vehicleType !== null
  )
}

export function filterListings(listings: MarketplaceListing[], category: ListingCategory, filters: MarketplaceFilters) {
  const { query, price, yearMin, yearMax, location, trim, vehicleType } = filters
  return listings.filter(
    (listing) =>
      matchesKind(listing, category, vehicleType) &&
      matchesPrice(listing, price) &&
      matchesYear(listing, yearMin, yearMax) &&
      (location === null || listing.location === location) &&
      (trim === null || (!isBuyerListing(listing) && listing.vehicle.trim.toLowerCase().includes(trim.toLowerCase()))) &&
      matchesQuery(listing, query),
  )
}

export function countByCategory(listings: MarketplaceListing[], filters: MarketplaceFilters) {
  const sharedFilters = { ...filters, vehicleType: null, trim: null }
  return {
    sell: filterListings(listings, 'sell', sharedFilters).length,
    buy: filterListings(listings, 'buy', sharedFilters).length,
  } satisfies Record<ListingCategory, number>
}
