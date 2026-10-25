import { CaretDown, Check, Plus } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { fieldClassName } from './fieldStyles.ts'

type ComboboxProps = {
  id: string
  options: string[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  allowCustomValue?: boolean
  emptyMessage?: string
  inputMode?: 'text' | 'numeric'
  inputRef?: RefObject<HTMLInputElement | null>
  describedBy?: string
}

type ComboboxItem = {
  value: string
  isCustom: boolean
}

function filterOptions(options: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return options

  const prefixMatches: string[] = []
  const otherMatches: string[] = []
  for (const option of options) {
    const normalizedOption = option.toLowerCase()
    if (normalizedOption.startsWith(normalizedQuery)) prefixMatches.push(option)
    else if (normalizedOption.includes(normalizedQuery)) otherMatches.push(option)
  }
  return [...prefixMatches, ...otherMatches]
}

function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const normalizedQuery = query.trim().toLowerCase()
  const matchIndex = normalizedQuery ? label.toLowerCase().indexOf(normalizedQuery) : -1
  if (matchIndex < 0) return <>{label}</>

  const matchEnd = matchIndex + normalizedQuery.length
  return (
    <>
      {label.slice(0, matchIndex)}
      <span className="font-semibold text-primary">{label.slice(matchIndex, matchEnd)}</span>
      {label.slice(matchEnd)}
    </>
  )
}

export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  allowCustomValue = false,
  emptyMessage = 'No matches',
  inputMode = 'text',
  inputRef,
  describedBy,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hasTyped, setHasTyped] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const ownInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const resolvedInputRef = inputRef ?? ownInputRef
  const listId = `${id}-listbox`

  const items = useMemo<ComboboxItem[]>(() => {
    const visibleOptions = hasTyped ? filterOptions(options, query) : options
    const nextItems = visibleOptions.map((option) => ({ value: option, isCustom: false }))
    const trimmedQuery = query.trim()
    const hasExactMatch = options.some(
      (option) => option.toLowerCase() === trimmedQuery.toLowerCase(),
    )
    if (allowCustomValue && hasTyped && trimmedQuery && !hasExactMatch) {
      nextItems.push({ value: trimmedQuery, isCustom: true })
    }
    return nextItems
  }, [allowCustomValue, hasTyped, options, query])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeIndex])

  function open() {
    if (disabled) return
    setQuery(value ?? '')
    setHasTyped(false)
    setActiveIndex(value ? Math.max(options.indexOf(value), 0) : 0)
    setIsOpen(true)
  }

  function close() {
    setIsOpen(false)
    setHasTyped(false)
    setActiveIndex(-1)
  }

  function select(nextValue: string) {
    onChange(nextValue)
    close()
  }

  function handleBlur() {
    if (!isOpen) return
    if (hasTyped) {
      const trimmedQuery = query.trim()
      const exactMatch = options.find(
        (option) => option.toLowerCase() === trimmedQuery.toLowerCase(),
      )
      if (!trimmedQuery) onChange(null)
      else if (exactMatch) onChange(exactMatch)
    }
    close()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen) open()
        else setActiveIndex((index) => Math.min(index + 1, items.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (isOpen) setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Enter':
        if (isOpen) {
          event.preventDefault()
          const activeItem = items[activeIndex]
          if (activeItem) select(activeItem.value)
        }
        break
      case 'Escape':
        if (isOpen) {
          event.preventDefault()
          close()
        }
        break
    }
  }

  const activeItemId =
    isOpen && activeIndex >= 0 && items[activeIndex] ? `${id}-option-${activeIndex}` : undefined

  return (
    <div className="relative">
      <input
        ref={resolvedInputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        inputMode={inputMode}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={activeItemId}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder={placeholder}
        value={isOpen ? query : (value ?? '')}
        onClick={() => {
          if (!isOpen) open()
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setHasTyped(true)
          setIsOpen(true)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`${fieldClassName} h-14 pr-12 pl-4`}
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label={isOpen ? 'Hide options' : 'Show options'}
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          if (isOpen) {
            close()
          } else {
            open()
            resolvedInputRef.current?.focus()
          }
        }}
        className="absolute inset-y-0 right-2 grid w-10 place-items-center text-text/50 transition-colors duration-200 hover:text-primary disabled:pointer-events-none disabled:text-text/25"
      >
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="grid place-items-center"
        >
          <CaretDown size={16} aria-hidden="true" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onPointerDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-full z-30 mt-2 origin-top overflow-hidden rounded-2xl border border-text/[0.08] bg-surface shadow-card-hover"
          >
            <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
              {items.map((item, index) => {
                const isSelected = !item.isCustom && item.value === value
                const isActive = index === activeIndex
                return (
                  <li
                    key={`${item.isCustom ? 'custom' : 'option'}-${item.value}`}
                    id={`${id}-option-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onMouseMove={() => {
                      if (!isActive) setActiveIndex(index)
                    }}
                    onClick={() => select(item.value)}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 font-body text-sm transition-colors duration-150 ${
                      isActive ? 'bg-primary-light/70' : ''
                    } ${isSelected ? 'font-medium text-primary' : 'text-text'}`}
                  >
                    {item.isCustom ? (
                      <span className="flex items-center gap-2">
                        <Plus size={14} className="text-primary" aria-hidden="true" />
                        Use “{item.value}”
                      </span>
                    ) : (
                      <span className="truncate">
                        {hasTyped ? <HighlightedLabel label={item.value} query={query} /> : item.value}
                      </span>
                    )}
                    {isSelected && <Check size={16} className="shrink-0 text-primary" aria-hidden="true" />}
                  </li>
                )
              })}
            </ul>
            {items.length === 0 && (
              <p className="px-4 pt-1 pb-4 font-body text-sm text-text/60">{emptyMessage}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
