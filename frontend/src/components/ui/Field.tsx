import type { ReactNode } from 'react'

type FieldProps = {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string | null
  children: ReactNode
}

export function Field({ id, label, optional = false, hint, error, children }: FieldProps) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 font-body text-sm font-medium"
      >
        {label}
        {optional && <span className="text-xs font-normal text-text/55">Optional</span>}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 font-body text-xs font-medium text-accent-strong">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-2 font-body text-xs text-text/60">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
