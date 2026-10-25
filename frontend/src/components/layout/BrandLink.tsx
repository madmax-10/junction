import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import logoSrc from '../ui/junction-logo.png'
import markSrc from '../ui/junction-mark.png'

const appName = 'Junction'

const toneClassNames = {
  default: 'text-text focus-visible:ring-primary focus-visible:ring-offset-background',
  inverse: 'text-background focus-visible:ring-primary-light focus-visible:ring-offset-text',
} as const

type BrandLinkProps = {
  collapsible?: boolean
  tone?: keyof typeof toneClassNames
}

// The PNGs are used as masks so the logo takes the current text color on light and dark surfaces.
function maskStyle(src: string): CSSProperties {
  const image = `url("${src}")`
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  }
}

export function BrandLink({ collapsible = false, tone = 'default' }: BrandLinkProps) {
  return (
    <Link
      to={paths.home}
      aria-label={`${appName} home`}
      className={`flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-4 ${toneClassNames[tone]}`}
    >
      {collapsible && (
        <span aria-hidden="true" className="block size-9 bg-current xl:hidden" style={maskStyle(markSrc)} />
      )}
      <span
        aria-hidden="true"
        className={`block aspect-[541/108] h-7 bg-current ${collapsible ? 'hidden xl:block' : ''}`}
        style={maskStyle(logoSrc)}
      />
    </Link>
  )
}
