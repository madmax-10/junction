import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { Button } from '../../components/ui/Button.tsx'
import { GuideAvatar } from './GuideAvatar.tsx'

type ChatHeaderProps = {
  hasMessages: boolean
  onReset: () => void
}

export function ChatHeader({ hasMessages, onReset }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-text/[0.06] px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <GuideAvatar size="md" />
        <div className="min-w-0">
          <h1 id="chat-title" className="font-heading text-base font-bold tracking-tight">
            Assistant
          </h1>
          <p className="truncate font-body text-xs text-text/60">Preview · replies are simulated</p>
        </div>
      </div>

      {hasMessages && (
        <Button variant="secondary" onClick={onReset} className="shrink-0">
          <ArrowCounterClockwise size={16} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">New chat</span>
        </Button>
      )}
    </header>
  )
}
