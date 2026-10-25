import {
  ArrowsClockwise,
  CloudLightning,
  Compass,
  DotsThreeOutline,
  FileX,
  Handshake,
  Receipt,
  Shuffle,
  Tag,
  Wrench,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { AccidentType, CurrentSituation, LearningInterest } from '../../types/intake.ts'
import { ImpactDiagram } from './ImpactDiagram.tsx'

type IntakeOption<TValue extends string> = {
  value: TValue
  label: string
  description: string
  icon: ReactNode
}

export const accidentTypeOptions: IntakeOption<AccidentType>[] = [
  {
    value: 'rear-end',
    label: 'Rear-end',
    description: 'Hit from behind',
    icon: <ImpactDiagram impact="rear" />,
  },
  {
    value: 'front-collision',
    label: 'Front collision',
    description: 'Your front end took the hit',
    icon: <ImpactDiagram impact="front" />,
  },
  {
    value: 'side-impact',
    label: 'Side impact',
    description: 'Hit on the driver or passenger side',
    icon: <ImpactDiagram impact="side" />,
  },
  {
    value: 'weather-damage',
    label: 'Weather damage',
    description: 'Hail, flooding, or fallen debris',
    icon: <CloudLightning size={22} />,
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else happened',
    icon: <DotsThreeOutline size={22} />,
  },
]

export const situationOptions: IntakeOption<CurrentSituation>[] = [
  {
    value: 'repair-estimate',
    label: 'Repair estimate received',
    description: 'You have a quote and need to decide what to do',
    icon: <Receipt size={22} />,
  },
  {
    value: 'total-loss',
    label: 'Insurance declared total loss',
    description: 'Your insurer says repairs would cost more than the car is worth',
    icon: <FileX size={22} />,
  },
  {
    value: 'figuring-out',
    label: 'Still figuring things out',
    description: 'It just happened, or you’re not sure what comes next',
    icon: <Compass size={22} />,
  },
]

export const notSureInterest: LearningInterest = 'not-sure'

export function toggleInterest(current: LearningInterest[], interest: LearningInterest) {
  if (current.includes(interest)) {
    return current.filter((item) => item !== interest)
  }
  if (interest === notSureInterest) {
    return [notSureInterest]
  }
  return [...current.filter((item) => item !== notSureInterest), interest]
}

export const interestOptions: IntakeOption<LearningInterest>[] = [
  {
    value: 'repaired',
    label: 'People who repaired their cars',
    description: 'What the repair involved and how the car held up',
    icon: <Wrench size={22} />,
  },
  {
    value: 'sold',
    label: 'People who sold their damaged cars',
    description: 'Selling as-is, trade-ins, and the offers they got',
    icon: <Tag size={22} />,
  },
  {
    value: 'replaced',
    label: 'People who replaced their cars',
    description: 'Moving on to a different car after the accident',
    icon: <ArrowsClockwise size={22} />,
  },
  {
    value: 'insurance-settlement',
    label: 'Insurance settlement experiences',
    description: 'Claims, payouts, and working with insurers',
    icon: <Handshake size={22} />,
  },
  {
    value: notSureInterest,
    label: 'I’m not sure yet',
    description: 'Show me a mix of experiences',
    icon: <Shuffle size={22} />,
  },
]

export function getOptionLabel<TValue extends string>(
  options: IntakeOption<TValue>[],
  value: TValue | null,
) {
  return options.find((option) => option.value === value)?.label ?? null
}
