import type { ButtonHTMLAttributes } from 'react'
import { getButtonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles.ts'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...buttonProps
}: ButtonProps) {
  return (
    <button type={type} className={getButtonClassName(variant, size, className)} {...buttonProps} />
  )
}
