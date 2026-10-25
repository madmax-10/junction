import { Route, Routes } from 'react-router'
import { AuthProvider } from '../features/auth/AuthProvider.tsx'
import { RequireAuth } from '../features/auth/RequireAuth.tsx'
import { SignInPage } from '../features/auth/SignInPage.tsx'
import { ChatPage } from '../features/chat/ChatPage.tsx'
import { ChatProvider } from '../features/chat/ChatProvider.tsx'
import { DescribeStep } from '../features/intake/DescribeStep.tsx'
import { IntakeLayout } from '../features/intake/IntakeLayout.tsx'
import { IntakeProvider } from '../features/intake/IntakeProvider.tsx'
import { InterestsStep } from '../features/intake/InterestsStep.tsx'
import { VehicleStep } from '../features/intake/VehicleStep.tsx'
import { LandingPage } from '../features/landing/LandingPage.tsx'
import { MarketplacePage } from '../features/marketplace/MarketplacePage.tsx'
import { StoriesPage } from '../features/stories/StoriesPage.tsx'
import { WorkspaceLayout } from '../features/workspace/WorkspaceLayout.tsx'
import { WorkspacePlaceholder } from '../features/workspace/WorkspacePlaceholder.tsx'
import { paths } from './paths.ts'
import { ScrollToTop } from './ScrollToTop.tsx'

export function App() {
  return (
    <AuthProvider>
      <IntakeProvider>
        <ChatProvider>
          <ScrollToTop />
          <Routes>
            <Route path={paths.home} element={<LandingPage />} />
            <Route element={<IntakeLayout />}>
              <Route path={paths.intake} element={<DescribeStep />} />
              <Route path={paths.intakeVehicle} element={<VehicleStep />} />
              <Route path={paths.intakeInterests} element={<InterestsStep />} />
            </Route>
            <Route path={paths.signIn} element={<SignInPage />} />
            <Route
              element={
                <RequireAuth>
                  <WorkspaceLayout />
                </RequireAuth>
              }
            >
              <Route path={paths.chat} element={<ChatPage />} />
              <Route path={paths.story} element={<StoriesPage />} />
              <Route path={paths.marketplaceListing} element={<MarketplacePage />} />
              <Route path={paths.myStory} element={<WorkspacePlaceholder tab="my-story" />} />
            </Route>
          </Routes>
        </ChatProvider>
      </IntakeProvider>
    </AuthProvider>
  )
}
