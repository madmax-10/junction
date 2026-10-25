import { Outlet } from 'react-router'
import { SiteHeader } from '../../components/layout/SiteHeader.tsx'

export function IntakeLayout() {
  return (
    <div className="min-h-svh bg-background text-text">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-6 pt-6 pb-20 sm:px-8 sm:pt-10">
        <Outlet />
      </main>
    </div>
  )
}
