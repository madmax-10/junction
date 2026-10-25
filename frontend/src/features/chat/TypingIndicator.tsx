import { motion } from 'motion/react'
import { GuideAvatar } from './GuideAvatar.tsx'

const dots = [0, 1, 2]

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <GuideAvatar />
      <div
        role="status"
        className="flex items-center gap-3 rounded-3xl rounded-tl-lg bg-background px-4 py-3"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          {dots.map((dot) => (
            <motion.span
              key={dot}
              className="size-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </span>
        <span className="font-body text-sm text-muted">Looking through experiences…</span>
      </div>
    </div>
  )
}
