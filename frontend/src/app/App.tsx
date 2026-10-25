import { Route, Routes } from 'react-router'
import { LandingPage } from '../features/landing/LandingPage.tsx'
import { paths } from './paths.ts'

export function App() {
  return (
    <Routes>
      <Route path={paths.home} element={<LandingPage />} />
    </Routes>
  )
}
