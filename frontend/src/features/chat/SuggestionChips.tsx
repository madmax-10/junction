import { Check, CheckCircle, ListPlus, X } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useRef } from 'react'
import type { DetailSuggestion } from '../../types/extraction.ts'
import {
  formatDetailValue,
  getDetailLabel,
  getReplacedValue,
  isDetailSaved,
} from '../intake/extractedDetails.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'

type SuggestionChipsProps = {
  suggestions: DetailSuggestion[]
  onConfirm: (suggestionId: string) => void
  onDismiss: (suggestionId: string) => void
}

const chipTransition = { duration: 0.2, ease: 'easeOut' } as const

export function SuggestionChips({ suggestions, onConfirm, onDismiss }: SuggestionChipsProps) {
  const { draft, confirmed } = useIntakeDraft()
  const sectionRef = useRef<HTMLElement>(null)

  const items = suggestions
    .filter((suggestion) => suggestion.status !== 'dismissed')
    .map((suggestion) => ({
      suggestion,
      isSaved: suggestion.status === 'confirmed' || isDetailSaved(suggestion, draft, confirmed),
    }))
  const pendingIds = items.filter((item) => !item.isSaved).map((item) => item.suggestion.id)

  if (items.length === 0) {
    return null
  }

  // Once everything is handled, collapse to a quiet one-line receipt so past turns stay light.
  if (pendingIds.length === 0) {
    return (
      <motion.section
        ref={sectionRef}
        tabIndex={-1}
        aria-label="Added to My Situation"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={chipTransition}
        className="flex max-w-[85%] items-start gap-1.5 font-body text-xs text-text/60 outline-none sm:max-w-[75%]"
      >
        <CheckCircle size={14} weight="fill" className="mt-px shrink-0 text-primary" aria-hidden="true" />
        <p>
          <span className="font-medium text-primary">Added to My Situation</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">: </span>
          {items.map(({ suggestion }) => formatDetailValue(suggestion)).join(', ')}
        </p>
      </motion.section>
    )
  }

  // Acting on a chip removes its buttons, so move focus somewhere predictable.
  function act(action: () => void) {
    action()
    requestAnimationFrame(() => {
      const nextAction = sectionRef.current?.querySelector<HTMLElement>('[data-suggestion-confirm]')
      ;(nextAction ?? sectionRef.current)?.focus()
    })
  }

  return (
    <motion.section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby={`${suggestions[0]?.id}-title`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={chipTransition}
      className="w-full max-w-[85%] rounded-2xl border border-primary/15 bg-primary-light/40 p-3 outline-none sm:max-w-[75%]"
    >
      <div className="flex items-center justify-between gap-3">
        <p
          id={`${suggestions[0]?.id}-title`}
          className="flex items-center gap-1.5 font-body text-xs font-semibold text-primary"
        >
          <ListPlus size={16} aria-hidden="true" />
          Add to My Situation?
        </p>
        {pendingIds.length > 1 && (
          <button
            type="button"
            onClick={() => act(() => pendingIds.forEach(onConfirm))}
            className="rounded-full px-2 py-1 font-body text-xs font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
          >
            Confirm all
          </button>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map(({ suggestion, isSaved }) => {
          const label = getDetailLabel(suggestion)
          const value = formatDetailValue(suggestion)
          const replaced = isSaved ? null : getReplacedValue(suggestion, draft)

          return (
            <motion.li key={suggestion.id} layout transition={chipTransition}>
              {isSaved ? (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/25 bg-surface px-3 font-body text-sm text-primary">
                  <CheckCircle size={16} weight="fill" aria-hidden="true" />
                  <span className="text-xs text-primary/75">{label}</span>
                  <span className="font-medium">{value}</span>
                  <span className="sr-only">added to My Situation</span>
                </span>
              ) : (
                <span
                  title={`From your message: “${suggestion.evidence}”`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-primary/40 bg-surface pr-1 pl-3 font-body text-sm"
                >
                  <span className="text-xs text-text/55">{label}</span>
                  <span className="font-medium">{value}</span>
                  {replaced && <span className="text-xs text-text/50">replaces {replaced}</span>}
                  <button
                    type="button"
                    data-suggestion-confirm
                    onClick={() => act(() => onConfirm(suggestion.id))}
                    aria-label={`Confirm ${label.toLowerCase()}: ${value}`}
                    className="ml-0.5 grid size-7 place-items-center rounded-full bg-primary text-surface transition-colors duration-200 outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                  >
                    <Check size={14} weight="bold" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => act(() => onDismiss(suggestion.id))}
                    aria-label={`Dismiss ${label.toLowerCase()}: ${value}`}
                    className="grid size-7 place-items-center rounded-full text-text/55 transition-colors duration-200 outline-none hover:bg-background hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X size={14} weight="bold" aria-hidden="true" />
                  </button>
                </span>
              )}
            </motion.li>
          )
        })}
      </ul>
    </motion.section>
  )
}
