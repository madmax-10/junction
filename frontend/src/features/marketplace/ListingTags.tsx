export function ConditionTag({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-body text-xs font-medium text-text">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      {label}
    </span>
  )
}
