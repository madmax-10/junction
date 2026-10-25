import { CheckCircle, PencilSimple } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { getIntakeHighlights } from '../intake/intakeHighlights.ts'

export function SituationSummary() {
  const { draft } = useIntakeDraft()
  const highlights = getIntakeHighlights(draft)
  const hasDetails = highlights.length > 0

  return (
    <section
      aria-label="My situation"
      className="flex items-center gap-2.5 rounded-2xl border border-text/[0.06] bg-surface py-2 pr-2 pl-3.5 shadow-card lg:hidden"
    >
      <CheckCircle size={16} className="shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate font-body text-xs">
        {hasDetails ? (
          <>
            <span className="text-text/60">My situation: </span>
            <span className="font-medium">{highlights.join(' · ')}</span>
          </>
        ) : (
          <span className="text-text/65">Add your car and accident details for closer matches</span>
        )}
      </p>
      <Link
        to={paths.intake}
        aria-label={hasDetails ? 'Edit situation details' : 'Add situation details'}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 font-body text-xs font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
      >
        <PencilSimple size={14} aria-hidden="true" />
        {hasDetails ? 'Edit' : 'Add'}
      </Link>
    </section>
  )
}
