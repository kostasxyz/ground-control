import { useEffect, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Icon } from './Icon'
import type { DirOpener } from '@shared/types'

/**
 * ------------------------------------------------
 * Titlebar "open folder" dropdown. Opens the active project directory (main
 * repo or its selected worktree) in the OS file browser or a detected
 * editor/IDE. Editor detection is macOS-only (see `src-tauri/src/openers.rs`);
 * off macOS only the reveal item shows. Disabled when no directory is
 * available (no active project).
 */
const REVEAL_LABEL =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
    ? 'Reveal in Finder'
    : 'Reveal in file browser'

const triggerClasses =
  'flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-md border-[0.5px] border-line bg-orange/5 text-cream-dim outline-none transition-all duration-150 hover:border-orange hover:bg-orange/14 hover:text-orange-bright aria-expanded:border-orange aria-expanded:bg-orange/13 aria-expanded:text-orange-bright disabled:cursor-default disabled:opacity-40'

const itemClasses =
  'flex w-full cursor-pointer items-center gap-2 rounded-[5px] px-2.5 py-[7px] text-body-sm text-cream outline-none select-none data-highlighted:bg-orange/12 data-highlighted:text-orange-bright'

export function OpenDirDropdown({ dir }: { dir: string | null }) {
  const [openers, setOpeners] = useState<DirOpener[]>([])

  useEffect(() => {
    let alive = true
    window.gc.dir.openers().then((list) => {
      if (alive) setOpeners(list)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={!dir}
        title="Open folder"
        aria-label="Open folder"
        className={triggerClasses}
      >
        <Icon name="folder-open" size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className="z-40">
          <Menu.Popup className="min-w-[200px] rounded-lg border-[0.5px] border-orange/40 bg-linear-160/srgb from-surface-2 to-surface p-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)] outline-none">
            <Menu.Item
              className={itemClasses}
              onClick={() => dir && window.gc.dir.reveal(dir)}
            >
              <Icon name="folder-open" size={14} className="shrink-0 opacity-80" />
              {REVEAL_LABEL}
            </Menu.Item>
            {openers.length > 0 && (
              <>
                <div className="my-1 h-px bg-line" role="separator" />
                {openers.map((o) => (
                  <Menu.Item
                    key={o.id}
                    className={itemClasses}
                    onClick={() => dir && window.gc.dir.openInApp(dir, o.id)}
                  >
                    <Icon name="code" size={14} className="shrink-0 opacity-80" />
                    Open in {o.label}
                  </Menu.Item>
                ))}
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
