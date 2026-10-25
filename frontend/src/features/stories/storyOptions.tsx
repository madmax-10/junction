import { ArrowsClockwise, Scales, Tag, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { BodyStyle, StoryChoice, StoryStatus } from '../../types/story.ts'

type StoryOption<TValue extends string> = {
  value: TValue
  label: string
}

export const choiceOptions: (StoryOption<StoryChoice> & { icon: ReactNode })[] = [
  { value: 'repair', label: 'Repaired', icon: <Wrench size={14} weight="bold" /> },
  { value: 'sell', label: 'Sold', icon: <Tag size={14} weight="bold" /> },
  { value: 'replace', label: 'Replaced', icon: <ArrowsClockwise size={14} weight="bold" /> },
  { value: 'undecided', label: 'Undecided', icon: <Scales size={14} weight="bold" /> },
]

export const bodyStyleOptions: StoryOption<BodyStyle>[] = [
  { value: 'sedan', label: 'Sedans' },
  { value: 'suv', label: 'SUVs' },
  { value: 'truck', label: 'Trucks' },
]

export const statusLabels: Record<StoryStatus, string> = {
  resolved: 'Resolved',
  ongoing: 'Ongoing',
}

export function getChoiceOption(choice: StoryChoice) {
  const option = choiceOptions.find((item) => item.value === choice)
  if (!option) {
    throw new Error(`Unknown story decision: ${choice}`)
  }
  return option
}
