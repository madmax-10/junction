import { CarProfile, Tag } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { ListingCategory, PriceRange, VehicleKind } from '../../types/marketplace.ts'

type MarketplaceOption<TValue> = {
  value: TValue
  label: string
}

export const categoryOptions: (MarketplaceOption<ListingCategory> & { description: string; icon: ReactNode })[] = [
  {
    value: 'sell',
    label: 'Sell your car',
    description: 'Cars people are selling',
    icon: <Tag size={22} weight="duotone" />,
  },
  {
    value: 'buy',
    label: 'Buy a car',
    description: 'Used listings and new cars',
    icon: <CarProfile size={22} weight="duotone" />,
  },
]

export const vehicleTypeOptions: MarketplaceOption<VehicleKind>[] = [
  { value: 'used', label: 'Used' },
  { value: 'new', label: 'New' },
]

export const locationOptions: MarketplaceOption<string>[] = ['Austin, TX', 'Dallas, TX', 'Houston, TX', 'San Antonio, TX'].map(
  (location) => ({ value: location, label: location }),
)

export const trimOptions: MarketplaceOption<string>[] = ['LX', 'EX', 'XLE', 'XLT'].map((trim) => ({
  value: trim,
  label: trim,
}))

export const priceOptions: (MarketplaceOption<PriceRange> & { min: number; max: number })[] = [
  { value: 'under-5k', label: 'Under $5,000', min: 0, max: 5000 },
  { value: '5k-10k', label: '$5,000 – $10,000', min: 5000, max: 10000 },
  { value: '10k-20k', label: '$10,000 – $20,000', min: 10000, max: 20000 },
  { value: '20k-30k', label: '$20,000 – $30,000', min: 20000, max: 30000 },
  { value: 'over-30k', label: 'Over $30,000', min: 30000, max: Infinity },
]

export const yearOptions: MarketplaceOption<number>[] = [2021, 2018, 2015, 2010].map((year) => ({
  value: year,
  label: `${year} and newer`,
}))

export const yearMaxOptions: MarketplaceOption<number>[] = [2024, 2020, 2016, 2012].map((year) => ({
  value: year,
  label: `${year} and older`,
}))

const priceFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const listedFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function formatPrice(amount: number) {
  return priceFormat.format(amount)
}

export function formatMiles(miles: number) {
  return `${miles.toLocaleString('en-US')} mi`
}

export function formatListedOn(isoDate: string) {
  return `Listed ${listedFormat.format(new Date(isoDate))}`
}
