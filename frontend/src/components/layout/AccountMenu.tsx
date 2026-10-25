import { SignOut } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { startTransition, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths.ts'
import { useAuth } from '../../features/auth/AuthContext.ts'
import { useChat } from '../../features/chat/ChatContext.ts'
import { useIntakeDraft } from '../../features/intake/IntakeContext.ts'

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return initials || '?'
}

const placementClassNames = {
  below: 'top-12 right-0 origin-top-right',
  above: 'bottom-12 left-0 origin-bottom-left',
} as const

type AccountMenuProps = {
  placement?: keyof typeof placementClassNames
}

export function AccountMenu({ placement = 'below' }: AccountMenuProps) {
  const offsetY = placement === 'below' ? -6 : 6
  const { user, signOut } = useAuth()
  const { resetChat } = useChat()
  const { resetDraft } = useIntakeDraft()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) {
    return null
  }

  function handleSignOut() {
    setIsOpen(false)
    navigate(paths.home)
    // Navigation renders in a transition; clearing auth in the same transition keeps
    // protected pages from redirecting to sign-in before the home page renders.
    startTransition(() => {
      resetChat()
      resetDraft()
      signOut()
    })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="account-menu"
        aria-label={`Account menu for ${user.name}`}
        className="grid size-10 place-items-center rounded-full bg-text font-heading text-sm font-bold text-surface transition-shadow duration-200 outline-none hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {getInitials(user.name)}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="account-menu"
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: offsetY, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: offsetY, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={`absolute z-40 w-64 ${placementClassNames[placement]} rounded-2xl border border-text/[0.06] bg-surface p-2 shadow-card-hover`}
          >
            <div className="px-3 py-2.5">
              <p className="truncate font-body text-sm font-semibold">{user.name}</p>
              <p className="truncate font-body text-xs text-text/60">{user.email}</p>
            </div>
            <div className="my-1 h-px bg-text/[0.06]" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-body text-sm font-medium text-text/80 transition-colors duration-150 outline-none hover:bg-background hover:text-text focus-visible:bg-background"
            >
              <SignOut size={18} aria-hidden="true" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
