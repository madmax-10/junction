import { BookOpenText, ChatsCircle, Storefront, UsersThree, type Icon } from '@phosphor-icons/react'
import { paths } from '../../app/paths.ts'

export type WorkspaceNavId = 'assistant' | 'stories' | 'marketplace' | 'my-story'

export type WorkspaceNavItem = {
  id: WorkspaceNavId
  to: string
  label: string
  shortLabel: string
  summary: string
  icon: Icon
}

export const workspaceNavItems: WorkspaceNavItem[] = [
  {
    id: 'assistant',
    to: paths.chat,
    label: 'Assistant',
    shortLabel: 'Assistant',
    summary: 'Ask questions and find people whose situations looked like yours.',
    icon: ChatsCircle,
  },
  {
    id: 'stories',
    to: paths.stories,
    label: 'Community Stories',
    shortLabel: 'Stories',
    summary: 'Browse what other owners decided, how it turned out, and what they learned.',
    icon: UsersThree,
  },
  {
    id: 'marketplace',
    to: paths.marketplace,
    label: 'Marketplace',
    shortLabel: 'Market',
    summary: 'Browse replacement cars and damaged cars sold as-is for repair or parts.',
    icon: Storefront,
  },
  {
    id: 'my-story',
    to: paths.myStory,
    label: 'My Story',
    shortLabel: 'My Story',
    summary: 'Share your own experience to help the next person in your shoes.',
    icon: BookOpenText,
  },
]

export function getWorkspaceNavItem(id: WorkspaceNavId) {
  const item = workspaceNavItems.find((navItem) => navItem.id === id)
  if (!item) {
    throw new Error(`Unknown workspace tab: ${id}`)
  }
  return item
}
