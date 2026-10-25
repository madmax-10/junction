import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { AccountMenu } from './AccountMenu.tsx'
import { BrandLink } from './BrandLink.tsx'
import { workspaceNavItems } from './workspaceNav.ts'

const indicatorTransition = { type: 'spring', bounce: 0.15, duration: 0.4 } as const

export function WorkspaceSidebar() {
  return (
    <aside className="hidden w-[4.5rem] shrink-0 flex-col rounded-[1.75rem] border border-text/[0.06] bg-surface p-3 shadow-card lg:flex xl:w-60">
      <div className="flex h-11 items-center justify-center xl:justify-start xl:px-1.5">
        <BrandLink labelClassName="hidden xl:inline" />
      </div>

      <nav aria-label="Workspace" className="mt-6">
        <ul className="flex flex-col gap-1">
          {workspaceNavItems.map(({ id, to, label, icon: Icon }) => (
            <li key={id}>
              <NavLink
                to={to}
                title={label}
                className={({ isActive }) =>
                  `relative isolate flex h-11 items-center justify-center gap-3 rounded-2xl font-body text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary xl:justify-start xl:px-3 ${
                    isActive ? 'text-primary' : 'text-text/65 hover:bg-background hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="workspace-sidebar-active"
                        transition={indicatorTransition}
                        className="absolute inset-0 -z-10 rounded-2xl bg-primary-light"
                        aria-hidden="true"
                      />
                    )}
                    <Icon size={22} weight={isActive ? 'fill' : 'regular'} className="shrink-0" aria-hidden="true" />
                    <span className="sr-only truncate xl:not-sr-only">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex justify-center border-t border-text/[0.06] pt-3 xl:justify-start xl:px-1">
        <AccountMenu placement="above" />
      </div>
    </aside>
  )
}
