import { lazy, Suspense, useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import { Tooltip } from '@/components/ui/Tooltip'
import { Titlebar } from '@/components/Titlebar'
import { WelcomePage } from '@/components/WelcomePage'
import { LoadingScreen } from '@/components/LoadingScreen'
import { StatusBar } from '@/components/StatusBar'
import { ArchiveSessionConfirm } from '@/components/ArchiveSessionConfirm'
import { flushTerminalAppearance, setTerminalApplyDeferred } from '@/terminal/registry'
import { setupZoom } from '@/lib/zoom'

const WorkspaceShell = lazy(() =>
  import('@/components/WorkspaceShell').then((module) => ({ default: module.WorkspaceShell }))
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
        {/* data-app-body: measurement hook for the dock-height drag (TerminalDock) */}
        <div className="flex min-h-0 flex-1" data-app-body>
          <Suspense fallback={null}>
            {workspaceLoaded && <WorkspaceShell hidden={view !== 'workspace' ? true : undefined} />}
            {view === 'settings' && <SettingsPage />}
            {view === 'gitDiff' && <GitDiffViewer />}
          </Suspense>
          {view === 'welcome' && <WelcomePage />}
        </div>
        <Suspense fallback={null}>
          {workspaceLoaded && <TerminalDock hidden={view !== 'workspace' ? true : undefined} />}
        </Suspense>
        <StatusBar />
        <ArchiveSessionConfirm />
      </div>
    </Tooltip.Provider>
  )
}
