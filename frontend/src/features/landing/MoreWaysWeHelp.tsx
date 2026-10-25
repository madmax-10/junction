import { ArrowRight, ChatsCircle, Storefront, UsersThree, type Icon } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { staggerVariants } from '../../styles/motion.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

type Feature = {
  icon: Icon
  title: string
  description: string
  action: string
  to: string
  iconClassName: string
}

const features: Feature[] = [
  {
    icon: ChatsCircle,
    title: 'AI Companion',
    description: 'Talk it through anytime. Ask follow-ups and get pointed to the stories that fit.',
    action: 'Start a conversation',
    to: paths.chat,
    iconClassName: 'bg-secondary text-surface',
  },
  {
    icon: UsersThree,
    title: 'Community Stories',
    description: 'Browse repairs, payouts, and fresh starts shared by owners in your shoes.',
    action: 'Read stories',
    to: paths.stories,
    iconClassName: 'bg-primary text-surface',
  },
  {
    icon: Storefront,
    title: 'Vehicle Marketplace',
    description: 'Find a replacement, or a damaged car sold as-is for repair or parts.',
    action: 'Browse cars',
    to: paths.marketplace,
    iconClassName: 'bg-surface-dark text-accent',
  },
]

const featureVariants = staggerVariants(0.1, 0.1)

export function MoreWaysWeHelp() {
  return (
    <section aria-labelledby="more-ways-title" className="pb-24 sm:pb-32">
      <div className={sectionContainerClassName}>
        <SectionIntro
          id="more-ways-title"
          eyebrow="More ways we help"
          title="Everything around the decision, in one place."
        />

        <motion.ul
          {...revealOnScroll}
          variants={featureVariants}
          className="mt-12 grid divide-y divide-border overflow-hidden rounded-[2rem] border border-border bg-surface shadow-card lg:grid-cols-3 lg:divide-x lg:divide-y-0"
        >
          {features.map(({ icon: FeatureIcon, title, description, action, to, iconClassName }) => (
            <motion.li key={title} variants={riseVariants} className="flex">
              <Link
                to={to}
                className="group relative flex w-full flex-col p-7 outline-none transition-colors duration-300 ease-out hover:bg-background/70 focus-visible:bg-background/70 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:p-9"
              >
                <span
                  className={`grid size-11 place-items-center rounded-2xl transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-105 ${iconClassName}`}
                  aria-hidden="true"
                >
                  <FeatureIcon size={22} />
                </span>
                <h3 className="mt-6 font-heading text-lg font-bold tracking-tight">{title}</h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-text/70">{description}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-primary lg:mt-auto lg:pt-6">
                  {action}
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-200 ease-out group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  )
}
