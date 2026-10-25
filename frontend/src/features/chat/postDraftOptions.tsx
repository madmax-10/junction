import { MagnifyingGlass, Tag, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { PostIssueType } from '../../types/post.ts'

type PostTypeMeta = {
  label: string
  destination: string
  postedLabel: string
  icon: ReactNode
}

export const postTypeMeta: Record<PostIssueType, PostTypeMeta> = {
  sell: {
    label: 'Car listing',
    destination: 'Marketplace',
    postedLabel: 'Your car is listed in the Marketplace',
    icon: <Tag size={16} weight="duotone" aria-hidden="true" />,
  },
  repair: {
    label: 'Repair experience',
    destination: 'Community stories',
    postedLabel: 'Your experience is shared in Community stories',
    icon: <Wrench size={16} weight="duotone" aria-hidden="true" />,
  },
  buy: {
    label: 'Looking for a car',
    destination: 'buyer requests',
    postedLabel: 'Your “looking for a car” post is live',
    icon: <MagnifyingGlass size={16} weight="duotone" aria-hidden="true" />,
  },
}
