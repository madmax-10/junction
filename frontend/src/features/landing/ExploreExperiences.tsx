import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { sampleExperiences } from '../../mocks/sampleStories.ts'
import { staggerVariants } from '../../styles/motion.ts'
import type { ExperienceHighlight } from '../../types/story.ts'
import { revealOnScroll, riseVariants, sectionContainerClassName } from './landingMotion.ts'
import { SectionIntro } from './SectionIntro.tsx'

const termClassName = 'font-body text-xs font-semibold tracking-wide text-muted uppercase'

const detailClassName = 'mt-2.5 font-body text-base leading-relaxed text-text/80'

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
          <p className="font-body text-sm font-medium text-primary">{experience.category}</p>
          <h3 id={titleId} className="mt-1.5 font-heading text-lg font-bold tracking-tight">
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
        <p className={termClassName}>What happened</p>
        <p className={detailClassName}>{experience.situation}</p>
      </div>

      <div className={columnClassName}>
        <p className={termClassName}>What they did</p>
        <p className={detailClassName}>{experience.decision}</p>
      </div>

      <div className={columnClassName}>
        <p className={termClassName}>How it went</p>
        <p className={detailClassName}>{experience.outcome}</p>
        <p className="mt-3 font-body text-sm font-semibold text-secondary">{experience.reported}</p>
      </div>
    </article>
  )
}

const listVariants = staggerVariants(0.12, 0.05)

export function ExploreExperiences() {
  return (
    <section aria-labelledby="explore-experiences-title" className="py-28 sm:py-36">
      <div className={sectionContainerClassName}>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <SectionIntro
            id="explore-experiences-title"
            title="Every story ends with an outcome."
            description="From the accident to the final bill."
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

        <motion.ul {...revealOnScroll} variants={listVariants} className="mt-16 flex flex-col gap-5 sm:mt-20">
          {sampleExperiences.map((experience) => (
            <motion.li key={experience.id} variants={riseVariants}>
              <ExperienceRow experience={experience} />
            </motion.li>
          ))}
        </motion.ul>

        <p className="mt-8 font-body text-sm text-muted">Example stories, shown for illustration.</p>
      </div>
    </section>
  )
}
