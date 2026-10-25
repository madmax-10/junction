import { User, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { RepairMethod, StoryPriceBand, StoryStatus } from '../../types/story.ts'

type StoryOption<TValue extends string> = {
  value: TValue
  label: string
}

export const methodOptions: (StoryOption<RepairMethod> & { icon: ReactNode })[] = [
  { value: 'mechanic', label: 'Mechanic', icon: <Wrench size={14} weight="bold" /> },
  { value: 'self', label: 'Self repair', icon: <User size={14} weight="bold" /> },
]

export const yearOptions: StoryOption<string>[] = [
  { value: '2018', label: '2018+' },
  { value: '2015', label: '2015+' },
  { value: '2010', label: '2010+' },
]

export const priceOptions: (StoryOption<StoryPriceBand> & { min: number; max: number })[] = [
  { value: 'under-5k', label: 'Under $5,000', min: 0, max: 5000 },
  { value: '5k-10k', label: '$5,000 – $10,000', min: 5000, max: 10000 },
  { value: '10k-20k', label: '$10,000 – $20,000', min: 10000, max: 20000 },
  { value: 'over-20k', label: 'Over $20,000', min: 20000, max: Infinity },
]

export const statusLabels: Record<StoryStatus, string> = {
  resolved: 'Resolved',
  ongoing: 'Ongoing',
}

export function getMethodOption(method: RepairMethod) {
  const option = methodOptions.find((item) => item.value === method)
  if (!option) {
    throw new Error(`Unknown repair method: ${method}`)
  }
  return option
}
