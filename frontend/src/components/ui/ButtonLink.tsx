import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { getButtonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles.ts'

type ButtonLinkProps = Omit<LinkProps, 'className'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...linkProps
}: ButtonLinkProps) {
  return (
    <Link className={getButtonClassName(variant, size, className)} {...linkProps}>
      {children}
    </Link>
  )
}
