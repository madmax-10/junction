import { ArrowRight, ArrowUpRight, Car, CheckCircle } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { sampleExperiences } from '../../mocks/sampleStories.ts'
import { staggerVariants } from '../../styles/motion.ts'
import type { ExperienceHighlight } from '../../types/story.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

const termClassName = 'font-body text-xs font-semibold tracking-wide text-muted uppercase'

const columnClassName = 'lg:border-l lg:border-border lg:pl-8'

function ExperienceRow({ experience }: { experience: ExperienceHighlight }) {
  const titleId = `experience-${experience.id}`

  return (
    <article
      aria-labelledby={titleId}
      className="group relative grid gap-6 rounded-[1.75rem] border border-border bg-surface/60 p-6 transition-[background-color,box-shadow,transform] duration-300 ease-out has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary hover:-translate-y-0.5 hover:bg-surface hover:shadow-card-hover sm:p-8 lg:grid-cols-[12.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-8"
    >
      <header className="flex items-start justify-between gap-4 lg:flex-col lg:justify-start">
        <div>
          <p className="font-body text-xs font-medium text-primary">{experience.category}</p>
          <h3 id={titleId} className="mt-1.5 flex items-center gap-1.5 font-heading text-base font-bold tracking-tight">
            <Car size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <Link to={paths.stories} className="outline-none after:absolute after:inset-0 after:rounded-[1.75rem]">
              {experience.vehicle}
              <span className="sr-only">: browse stories like this one</span>
            </Link>
          </h3>
        </div>
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-text/60 transition-[background-color,border-color,color,transform] duration-300 ease-out group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary group-hover:text-surface lg:mt-auto"
        >
          <ArrowUpRight size={16} />
        </span>
      </header>

      <div className={columnClassName}>
        <p className={termClassName}>The situation</p>
        <p className="mt-2 font-body text-[0.95rem] leading-relaxed">{experience.situation}</p>
      </div>

      <div className={columnClassName}>
        <p className={termClassName}>What they decided</p>
        <p className="mt-2 font-body text-[0.95rem] leading-relaxed">{experience.decision}</p>
      </div>

      <div className={columnClassName}>
        <p className={termClassName}>Reported outcome</p>
        <p className="mt-2 font-body text-[0.95rem] leading-relaxed">{experience.outcome}</p>
        <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl bg-secondary-light px-3 py-1.5 font-body text-xs leading-snug font-semibold text-secondary">
          <CheckCircle size={14} weight="fill" className="mt-px shrink-0" aria-hidden="true" />
          {experience.reported}
        </p>
      </div>
    </article>
  )
}

const listVariants = staggerVariants(0.12, 0.05)

export function ExploreExperiences() {
  return (
    <section aria-labelledby="explore-experiences-title" className="py-24 sm:py-32">
      <div className={sectionContainerClassName}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionIntro
            id="explore-experiences-title"
            eyebrow="Explore experiences"
            title="Every story ends with what actually happened."
            description="Owners share the situation they faced, the call they made, and how it turned out, so you can weigh your options with real context."
          />
          <motion.div {...revealOnScroll} variants={riseVariants} className="shrink-0">
            <Link
              to={paths.stories}
              className="group inline-flex items-center gap-2 rounded-full font-body text-base font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1.5px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_1.5px]">
                Browse all stories
              </span>
              <ArrowRight
                size={18}
                className="transition-transform duration-200 ease-out group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </motion.div>
        </div>

        <motion.ul {...revealOnScroll} variants={listVariants} className="mt-14 flex flex-col gap-4">
          {sampleExperiences.map((experience) => (
            <motion.li key={experience.id} variants={riseVariants}>
              <ExperienceRow experience={experience} />
            </motion.li>
          ))}
        </motion.ul>

        <p className="mt-6 font-body text-xs text-muted">
          Example stories shown for illustration. Outcomes are owner-reported, not advice.
        </p>
      </div>
    </section>
  )
}
