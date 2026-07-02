import { lazy, Suspense, useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import { Tooltip } from '@/components/ui/Tooltip'
import { Titlebar } from '@/components/Titlebar'
import { WorkspaceBar } from '@/components/WorkspaceBar'
import { WelcomePage } from '@/components/WelcomePage'
import { LoadingScreen } from '@/components/LoadingScreen'
import { StatusBar } from '@/components/StatusBar'
import { ArchiveSessionConfirm } from '@/components/ArchiveSessionConfirm'
import { flushTerminalAppearance, setTerminalApplyDeferred } from '@/terminal/registry'
import { setupZoom } from '@/lib/zoom'

const IconRail = lazy(() =>
  import('@/components/IconRail').then((module) => ({ default: module.IconRail }))
)
const ContentSplit = lazy(() =>
  import('@/components/ContentSplit').then((module) => ({ default: module.ContentSplit }))
)
const TerminalDock = lazy(() =>
  import('@/components/TerminalDock').then((module) => ({ default: module.TerminalDock }))
)
const SettingsPage = lazy(() =>
  import('@/components/SettingsPage').then((module) => ({ default: module.SettingsPage }))
)
const GitDiffViewer = lazy(() =>
  import('@/components/GitDiffViewer').then((module) => ({ default: module.GitDiffViewer }))
)

/**
 * ------------------------------------------------
 * Root app shell.
 * @returns {JSX.Element} App element.
 */
export default function App() {
  const ready = useStore((s) => s.ready)
  const bootstrap = useStore((s) => s.bootstrap)
  const view = useStore((s) => s.view)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // Cmd/Ctrl +/-/0 webview zoom (restores persisted level, binds hotkeys).
  useEffect(() => setupZoom(), [])

  useEffect(() => {
    setTerminalApplyDeferred(view !== 'workspace')
    if (view === 'workspace') flushTerminalAppearance()
  }, [view])

  useEffect(() => {
    if (view === 'workspace' || activeProjectId !== null) setWorkspaceLoaded(true)
  }, [activeProjectId, view])

  // Gate on ready so persisted state (including the selected theme) is loaded
  // before the shell renders. The splash carries the theme (seeded in main.tsx)
  // so there's no flash of default appearance.
  if (!ready) return <LoadingScreen />

  return (
    <Tooltip.Provider delay={500}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-linear-to-b/srgb from-surface-2 to-surface">
        <div className="grain" />
        <Titlebar />
        {/* Full-width workspace controls bar (project switcher + per-project git
            controls). Shown in the workspace and git-diff views; the git block
            inside only renders once a project is active. */}
        {workspaceLoaded && (view === 'workspace' || view === 'gitDiff') && <WorkspaceBar />}
        {/* The rail spans the full height between titlebar and status bar; the
            body + terminal dock stack in a column to its right so the dock never
            extends under the rail's column. */}
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={null}>
            {workspaceLoaded && <IconRail hidden={view !== 'workspace' ? true : undefined} />}
            {/* The body and the terminal dock are flex siblings in this column.
                Opening the dock grows it via flex-grow and squeezes the agent pane
                (which resizes its height), instead of overlaying it. The panel can
                be dragged up to (near) the top. */}
            {/* min-w-0: without it this column's min-width:auto resolves to its
                content's min-content, which includes the dock's terminals
                (n × min-w-300px). Past ~2 terminals that overflows the row and
                widens the whole app — including the agent pane — instead of
                letting the dock's group scroll internally. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* overflow-hidden clips the body's content (sessions pane, its
                  scrollbar) to its own box so nothing bleeds over the terminal
                  dock below — the dock now sits beside the body as a flex sibling
                  instead of overlaying it. */}
              <div className="flex min-h-0 flex-1 overflow-hidden" data-app-body>
                {workspaceLoaded && <ContentSplit hidden={view !== 'workspace' ? true : undefined} />}
                {view === 'settings' && <SettingsPage />}
                {view === 'gitDiff' && <GitDiffViewer />}
                {view === 'welcome' && <WelcomePage />}
              </div>
              {workspaceLoaded && <TerminalDock hidden={view !== 'workspace' ? true : undefined} />}
            </div>
          </Suspense>
        </div>
        <StatusBar />
        <ArchiveSessionConfirm />
      </div>
    </Tooltip.Provider>
  )
}
