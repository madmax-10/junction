import type { ReactNode } from 'react'

type BadgeTone = 'neutral' | 'secondary'

const toneClassNames: Record<BadgeTone, string> = {
  neutral: 'bg-background text-text',
  secondary: 'bg-secondary-light text-secondary',
}

type BadgeProps = {
  tone?: BadgeTone
  icon?: ReactNode
  children: ReactNode
}

export function Badge({ tone = 'neutral', icon, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-xs font-medium ${toneClassNames[tone]}`}
    >
      {icon}
      {children}
    </span>
  )
}
