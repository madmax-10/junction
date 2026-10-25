import type { ListingCategory, MarketplaceFilters, MarketplaceListing } from '../../types/marketplace.ts'
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
  return !range || (listing.price >= range.min && (range.max === Infinity || listing.price < range.max))
}

function matchesKind(listing: MarketplaceListing, category: ListingCategory, vehicleType: MarketplaceFilters['vehicleType']) {
  if (category === 'sell') return listing.kind === 'sell'
  if (vehicleType === 'used') return listing.kind === 'sell'
  if (vehicleType === 'new') return listing.kind === 'new'
  return true
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
      (yearMin === null || listing.vehicle.year >= yearMin) &&
      (yearMax === null || listing.vehicle.year <= yearMax) &&
      (location === null || listing.location === location) &&
      (trim === null || listing.vehicle.trim.toLowerCase().includes(trim.toLowerCase())) &&
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
