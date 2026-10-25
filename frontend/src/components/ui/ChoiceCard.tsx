import { CheckCircle, CheckSquare } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

type ChoiceCardProps = {
  name: string
  value: string
  label: string
  description: string
  icon: ReactNode
  checked: boolean
  onSelect: (value: string) => void
  orientation?: 'tile' | 'row'
  multiple?: boolean
}

const indicatorTransition = { duration: 0.18, ease: 'easeOut' } as const

export function ChoiceCard({
  name,
  value,
  label,
  description,
  icon,
  checked,
  onSelect,
  orientation = 'row',
  multiple = false,
}: ChoiceCardProps) {
  const isTile = orientation === 'tile'
  const indicatorPosition = isTile ? 'top-3 right-3' : 'top-1/2 right-4 -translate-y-1/2'

  return (
    <label
      className={`relative flex h-full cursor-pointer rounded-2xl border transition-[border-color,box-shadow,background-color] duration-200 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        isTile ? 'flex-col gap-3 p-4' : 'items-center gap-4 px-4 py-3.5'
      } ${
        checked
          ? 'border-primary bg-secondary-light shadow-card ring-1 ring-primary'
          : 'border-border bg-surface hover:border-primary/35 hover:shadow-card'
      }`}
    >
      <input
        type={multiple ? 'checkbox' : 'radio'}
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />

      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors duration-200 ${
          checked ? 'bg-primary text-surface' : 'bg-primary-light text-primary'
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>

      <span className={`min-w-0 ${isTile ? 'pr-5' : 'flex-1 pr-7'}`}>
        <span className="block font-heading text-[0.95rem] font-bold leading-snug tracking-tight">
          {label}
        </span>
        <span className="mt-0.5 block font-body text-sm leading-snug text-muted">
          {description}
        </span>
      </span>

      {multiple ? (
        <span className={`absolute grid size-[22px] place-items-center ${indicatorPosition}`} aria-hidden="true">
          <span
            className={`size-[17px] rounded-[5px] border-2 transition-colors duration-200 ${
              checked ? 'border-transparent' : 'border-text/20'
            }`}
          />
          <AnimatePresence initial={false}>
            {checked && (
              <motion.span
                key="check"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={indicatorTransition}
                className="absolute inset-0 grid place-items-center text-primary"
              >
                <CheckSquare size={22} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      ) : (
        <AnimatePresence initial={false}>
          {checked && (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={indicatorTransition}
              className={`absolute text-primary ${indicatorPosition}`}
              aria-hidden="true"
            >
              <CheckCircle size={22} />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </label>
  )
}
