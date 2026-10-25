import { CarProfile, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { ListingCategory, ListingCondition, PriceRange, TitleStatus } from '../../types/marketplace.ts'

type MarketplaceOption<TValue> = {
  value: TValue
  label: string
}

export const categoryOptions: (MarketplaceOption<ListingCategory> & { description: string; icon: ReactNode })[] = [
  {
    value: 'replacement',
    label: 'Replacement cars',
    description: 'Ready to drive if yours was totaled',
    icon: <CarProfile size={22} weight="duotone" />,
  },
  {
    value: 'damaged',
    label: 'Damaged cars',
    description: 'Sold as-is for repair or parts',
    icon: <Wrench size={22} weight="duotone" />,
  },
]

export const conditionLabels: Record<ListingCondition, string> = {
  excellent: 'Excellent condition',
  good: 'Good condition',
  fair: 'Fair condition',
  minor: 'Minor damage',
  moderate: 'Moderate damage',
  severe: 'Severe damage',
}

const categoryConditions: Record<ListingCategory, ListingCondition[]> = {
  replacement: ['excellent', 'good', 'fair'],
  damaged: ['minor', 'moderate', 'severe'],
}

export function getConditionOptions(category: ListingCategory): MarketplaceOption<ListingCondition>[] {
  return categoryConditions[category].map((condition) => ({ value: condition, label: conditionLabels[condition] }))
}

export const conditionDotClassNames: Record<ListingCondition, string> = {
  excellent: 'bg-secondary',
  good: 'bg-accent',
  fair: 'bg-text/35',
  minor: 'bg-accent',
  moderate: 'bg-danger/60',
  severe: 'bg-danger',
}

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

export const mileageOptions: MarketplaceOption<number>[] = [30000, 60000, 100000, 150000].map((miles) => ({
  value: miles,
  label: `Under ${miles.toLocaleString('en-US')} mi`,
}))

export const titleStatusLabels: Record<TitleStatus, string> = {
  clean: 'Clean title',
  rebuilt: 'Rebuilt title',
  salvage: 'Salvage title',
}

const priceFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
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
