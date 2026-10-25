import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'md' | 'lg'

const baseClassName =
  'group inline-flex items-center justify-center gap-2 rounded-full font-body font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]'

const variantClassNames: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-surface shadow-card hover:bg-primary-hover hover:shadow-card-hover',
  secondary: 'border border-text/15 bg-surface text-text hover:border-primary/40 hover:text-primary',
}

const sizeClassNames: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-sm',
  lg: 'h-14 px-7 text-base',
}

type ButtonLinkProps = Omit<LinkProps, 'className'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...linkProps
}: ButtonLinkProps) {
  return (
    <Link
      className={`${baseClassName} ${variantClassNames[variant]} ${sizeClassNames[size]} ${className}`}
      {...linkProps}
    >
      {children}
    </Link>
  )
}
