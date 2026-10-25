import { ChatsCircle } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { ButtonLink } from '../ui/ButtonLink.tsx'

const appName = 'Car Owner Hub'

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6">
      <Link
        to={paths.home}
        aria-label={`${appName} home`}
        className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-surface">
          <ChatsCircle size={20} aria-hidden="true" />
        </span>
        <span className="hidden font-heading text-lg font-bold tracking-tight sm:inline">
          {appName}
        </span>
      </Link>

      <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
        <Link
          to={paths.stories}
          className="rounded-full px-3 py-2 font-body text-sm font-medium text-text/80 transition-colors duration-200 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          Explore Stories
        </Link>
        <ButtonLink to={paths.share} variant="secondary">
          Share Experience
        </ButtonLink>
      </nav>
    </header>
  )
}
