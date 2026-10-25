import { NavLink } from 'react-router'
import { workspaceNavItems } from './workspaceNav.ts'

export function WorkspaceTabBar() {
  return (
    <nav
      aria-label="Workspace"
      className="mx-3 mt-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-[1.5rem] border border-border bg-surface px-1.5 py-1.5 shadow-card lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {workspaceNavItems.map(({ id, to, label, shortLabel, icon: Icon }) => (
          <li key={id}>
            <NavLink
              to={to}
              aria-label={label}
              className={({ isActive }) =>
                `group flex flex-col items-center gap-0.5 rounded-2xl py-1 font-body text-[0.7rem] font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isActive ? 'text-primary' : 'text-muted hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-7 w-12 place-items-center rounded-full transition-colors duration-200 ${
                      isActive ? 'bg-primary-light' : ''
                    }`}
                    aria-hidden="true"
                  >
                    <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                  </span>
                  <span aria-hidden="true">{shortLabel}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
