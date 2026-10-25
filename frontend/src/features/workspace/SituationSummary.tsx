import { BadgeCheck, CircleDashed, PencilLine } from 'lucide-react'
import { situationSections, useIntakeDraft } from '../intake/IntakeContext.ts'
import { getIntakeHighlights } from '../intake/intakeHighlights.ts'
import { getSectionStatus } from '../intake/situationFields.ts'

export function SituationSummary({ onEdit }: { onEdit: () => void }) {
  const { draft, confirmed } = useIntakeDraft()
  const highlights = getIntakeHighlights(draft)
  const hasDetails = highlights.length > 0
  const isFullyConfirmed = situationSections.every(
    (section) => getSectionStatus(draft, confirmed, section) !== 'unconfirmed',
  )
  const StatusIcon = isFullyConfirmed ? BadgeCheck : CircleDashed

  return (
    <section
      aria-label="My situation"
      className="flex items-center gap-2.5 rounded-2xl border border-text/[0.06] bg-surface py-2 pr-2 pl-3.5 shadow-card lg:hidden"
    >
      <StatusIcon
        size={16}
        strokeWidth={2}
        className={`shrink-0 ${isFullyConfirmed ? 'text-primary' : 'text-text/45'}`}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 truncate font-body text-xs">
        {hasDetails ? (
          <>
            <span className="text-text/60">My situation: </span>
            <span className="font-medium">{highlights.join(' · ')}</span>
            {!isFullyConfirmed && <span className="text-text/55"> · needs review</span>}
          </>
        ) : (
          <span className="text-text/65">Add your car and accident details for closer matches</span>
        )}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 font-body text-xs font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
      >
        <PencilLine size={14} strokeWidth={1.75} aria-hidden="true" />
        {hasDetails ? 'Edit details' : 'Add details'}
      </button>
    </section>
  )
}
