import { Link, useLocation } from 'react-router'
import { paths } from '../../app/paths.ts'
import { useAuth } from '../../features/auth/AuthContext.ts'
import { ButtonLink } from '../ui/ButtonLink.tsx'
import { AccountMenu } from './AccountMenu.tsx'
import { BrandLink } from './BrandLink.tsx'

const navLinkClassName =
  'rounded-full px-3 py-2 font-body text-sm font-medium text-text/80 transition-colors duration-200 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary'

export function SiteHeader() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const showSignIn = !user && pathname !== paths.signIn

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6">
      <BrandLink />

      <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
        <Link to={paths.stories} className={`hidden sm:inline-flex ${navLinkClassName}`}>
          Explore Stories
        </Link>
        {showSignIn && (
          <Link to={paths.signIn} className={navLinkClassName}>
            Sign in
          </Link>
        )}
        <ButtonLink to={paths.myStory} variant="secondary">
          Share Experience
        </ButtonLink>
        <AccountMenu />
      </nav>
    </header>
  )
}
