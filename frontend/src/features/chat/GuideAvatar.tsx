import { ChatsCircle } from '@phosphor-icons/react'

type GuideAvatarProps = {
  size?: 'sm' | 'md'
}

export function GuideAvatar({ size = 'sm' }: GuideAvatarProps) {
  const isMedium = size === 'md'

  return (
    <span
      className={`grid shrink-0 place-items-center bg-secondary text-surface ${
        isMedium ? 'size-10 rounded-2xl' : 'size-8 rounded-xl'
      }`}
      aria-hidden="true"
    >
      <ChatsCircle size={isMedium ? 22 : 18} />
    </span>
  )
}
