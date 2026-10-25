import type { TextareaHTMLAttributes } from 'react'
import { fieldClassName } from './fieldStyles.ts'

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className = '', ...textAreaProps }: TextAreaProps) {
  return (
    <textarea
      className={`${fieldClassName} resize-none px-4 py-3.5 leading-relaxed ${className}`}
      {...textAreaProps}
    />
  )
}
