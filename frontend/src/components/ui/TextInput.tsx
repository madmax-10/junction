import type { InputHTMLAttributes } from 'react'
import { fieldClassName } from './fieldStyles.ts'

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  suffix?: string
}

export function TextInput({ suffix, className = '', ...inputProps }: TextInputProps) {
  return (
    <div className="relative">
      <input
        className={`${fieldClassName} h-14 px-4 ${suffix ? 'pr-16' : ''} ${className}`}
        {...inputProps}
      />
      {suffix && (
        <span
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-body text-sm text-text/55"
          aria-hidden="true"
        >
          {suffix}
        </span>
      )}
    </div>
  )
}
