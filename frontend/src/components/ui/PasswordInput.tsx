import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useState, type InputHTMLAttributes } from 'react'
import { fieldClassName } from './fieldStyles.ts'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function PasswordInput({ className = '', ...inputProps }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={isVisible ? 'text' : 'password'}
        className={`${fieldClassName} h-14 pr-14 pl-4 ${className}`}
        {...inputProps}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-2 my-auto grid size-10 place-items-center rounded-full text-text/55 transition-colors duration-200 outline-none hover:bg-primary-light hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
      >
        {isVisible ? <EyeSlash size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  )
}
