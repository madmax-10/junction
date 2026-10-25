import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { Outlet, useMatch } from 'react-router'
import { paths } from '../../app/paths.ts'
import { AccountMenu } from '../../components/layout/AccountMenu.tsx'
import { BrandLink } from '../../components/layout/BrandLink.tsx'
import { WorkspaceSidebar } from '../../components/layout/WorkspaceSidebar.tsx'
import { WorkspaceTabBar } from '../../components/layout/WorkspaceTabBar.tsx'
import type { SituationSection } from '../../types/intake.ts'
import { useChat, useLatestReply } from '../chat/ChatContext.ts'
import { ExperiencePanel } from '../chat/ExperiencePanel.tsx'
import { SituationEditor } from './SituationEditor.tsx'
import { SituationIsland } from './SituationIsland.tsx'
import { SituationSummary } from './SituationSummary.tsx'

type EditorState = { section: SituationSection | null } | null

export function WorkspaceLayout() {
  const { isResponding } = useChat()
  const latestReply = useLatestReply()
  const isAssistant = useMatch(paths.chat) !== null
  const [editor, setEditor] = useState<EditorState>(null)

  function openEditor(section: SituationSection | null = null) {
    setEditor({ section })
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-svh flex-col bg-background text-text lg:flex-row lg:gap-3 lg:p-3">
        <WorkspaceSidebar />

        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 lg:hidden">
          <BrandLink />
          <AccountMenu />
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-3 lg:px-0">
          <SituationSummary onEdit={() => openEditor()} />
          <main className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>

        <div className="hidden w-[20rem] shrink-0 flex-col gap-3 lg:flex xl:w-[22rem]">
          <SituationIsland className={isAssistant ? 'max-h-[60%] shrink-0' : ''} onEdit={openEditor} />
          {isAssistant && (
            <ExperiencePanel
              matches={latestReply?.matches ?? []}
              resultsKey={latestReply?.id ?? null}
              isSearching={isResponding}
            />
          )}
        </div>

        <WorkspaceTabBar />
      </div>

      <SituationEditor
        isOpen={editor !== null}
        focusSection={editor?.section ?? null}
        onClose={() => setEditor(null)}
      />
    </MotionConfig>
  )
}
