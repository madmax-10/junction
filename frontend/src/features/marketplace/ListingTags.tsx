import type { ListingCondition } from '../../types/marketplace.ts'
import { conditionDotClassNames, conditionLabels } from './marketplaceOptions.tsx'

export function ConditionTag({ condition }: { condition: ListingCondition }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-body text-xs font-medium text-text">
      <span className={`size-1.5 rounded-full ${conditionDotClassNames[condition]}`} aria-hidden="true" />
      {conditionLabels[condition]}
    </span>
  )
}
