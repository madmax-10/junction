import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { BrandLink } from '../../components/layout/BrandLink.tsx'

const currentYear = new Date().getFullYear()

const footerLinks = [
  { label: 'Community Stories', to: paths.stories },
  { label: 'AI Companion', to: paths.chat },
  { label: 'Marketplace', to: paths.marketplace },
  { label: 'Share your experience', to: paths.myStory },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <BrandLink />
          <p className="max-w-xs font-body text-xs leading-relaxed text-muted">
            Stories are shared by owners and reflect their own experience. Not legal, financial, or insurance advice.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {footerLinks.map((link) => (
              <li key={link.label}>
                <Link
                  to={link.to}
                  className="rounded-sm font-body text-sm text-text/75 outline-none transition-colors duration-200 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto w-full max-w-6xl px-6 pb-8 font-body text-xs text-muted sm:px-8">
        © {currentYear} Junction
      </p>
    </footer>
  )
}
