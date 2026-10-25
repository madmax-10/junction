import { Plus } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { easeOutQuint } from '../../styles/motion.ts'

export function ListYourCarButton() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        aria-expanded={isOpen}
        aria-controls="list-your-car-note"
        onClick={() => setIsOpen((current) => !current)}
        className="h-11 px-5"
      >
        <Plus size={18} weight="bold" aria-hidden="true" />
        List your car
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="list-your-car-note"
            role="status"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: easeOutQuint }}
            className="absolute top-full left-0 z-30 mt-2 w-72 origin-top-left rounded-2xl border border-text/[0.06] bg-surface p-4 shadow-card-hover sm:right-0 sm:left-auto sm:origin-top-right"
          >
            <p className="font-heading text-sm font-bold tracking-tight">Selling opens soon</p>
            <p className="mt-1 font-body text-sm leading-relaxed text-text/65">
              You’ll be able to list a replacement or damaged car here, and choose what buyers can see before it goes
              live.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
