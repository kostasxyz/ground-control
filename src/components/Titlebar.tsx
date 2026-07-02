import { useStore } from '@/state/store'
import { IconButton } from './ui/IconButton'
import { Icon } from './Icon'

/**
 * ------------------------------------------------
 * Window titlebar. Brand centered, app settings toggle on the right. The bar is
 * kept short so its content lines up vertically with the native macOS traffic
 * lights. All project controls (switcher, git, new session) live in the
 * full-width WorkspaceBar below.
 * @returns {JSX.Element} Titlebar element.
 */
export function Titlebar() {
  const view = useStore((s) => s.view)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const setView = useStore((s) => s.setView)

  return (
    // pl clears the native traffic lights; data-tauri-drag-region makes the bar a window drag handle
    <div data-tauri-drag-region className="relative flex h-8 shrink-0 items-center border-b border-line bg-(image:--grad-titlebar) pr-4 pl-[90px]">
      {/* Brand centered across the full bar width; pointer-events-none lets clicks
          on it fall through to the drag region. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 font-display text-heading-2xs font-extrabold tracking-[0.02em]">
        <span className="glow-orange">GROUND</span>
        <span className="text-cream">CONTROL</span>
      </div>
      <div className="app-no-drag ml-auto flex h-full items-center gap-2 pr-1">
        <IconButton
          size="sm"
          tooltip={view === 'settings' ? 'Close settings' : 'Settings'}
          onClick={() => setView(view === 'settings' ? (activeProjectId ? 'workspace' : 'welcome') : 'settings')}
        >
          <Icon name="gear" size={14} />
        </IconButton>
      </div>
    </div>
  )
}
