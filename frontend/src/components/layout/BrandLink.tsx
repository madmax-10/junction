import { ChatsCircle } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'

const appName = 'Car Owner Hub'

type BrandLinkProps = {
  labelClassName?: string
}

export function BrandLink({ labelClassName = 'hidden sm:inline' }: BrandLinkProps) {
  return (
    <Link
      to={paths.home}
      aria-label={`${appName} home`}
      className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-surface">
        <ChatsCircle size={20} aria-hidden="true" />
      </span>
      <span className={`font-heading text-lg font-bold tracking-tight whitespace-nowrap ${labelClassName}`}>
        {appName}
      </span>
    </Link>
  )
}
