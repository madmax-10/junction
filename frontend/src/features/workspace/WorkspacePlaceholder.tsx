import { motion } from 'motion/react'
import { getWorkspaceNavItem, type WorkspaceNavId } from '../../components/layout/workspaceNav.ts'
import { Badge } from '../../components/ui/Badge.tsx'
import { easeOutQuint } from '../../styles/motion.ts'

export function WorkspacePlaceholder({ tab }: { tab: WorkspaceNavId }) {
  const { label, icon: Icon } = getWorkspaceNavItem(tab)
  const titleId = `${tab}-title`

  return (
    <motion.section
      key={tab}
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: easeOutQuint }}
      className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[1.75rem] border border-border bg-surface px-6 py-12 text-center shadow-card"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-light text-primary" aria-hidden="true">
        <Icon size={26} weight="duotone" />
      </span>
      <h1 id={titleId} className="mt-5 font-heading text-2xl font-extrabold tracking-[-0.02em]">
        {label}
      </h1>
      <div className="mt-4">
        <Badge>Coming soon</Badge>
      </div>
    </motion.section>
  )
}
