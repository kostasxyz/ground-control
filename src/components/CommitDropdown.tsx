import { Menu } from '@base-ui/react/menu'
import { Icon, type IconName } from './Icon'

/**
 * ------------------------------------------------
 * Titlebar commit menu (next to the changes badge). Icon-only trigger opening
 * Commit / Push / Commit and Push. Actions are placeholders for now — selecting
 * one just closes the menu (ADR git-commit wiring TBD).
 * @returns {JSX.Element} Commit dropdown element.
 */
const ACTIONS: { label: string; icon: IconName }[] = [
  { label: 'Commit', icon: 'git-commit' },
  { label: 'Push', icon: 'arrow-up-from-line' },
  { label: 'Commit and Push', icon: 'cloud-upload' }
]

export function CommitDropdown() {
  return (
    <Menu.Root>
      <Menu.Trigger
        title="Commit"
        aria-label="Commit actions"
        className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-md border-[0.5px] border-line bg-orange/5 text-cream-dim outline-none transition-all duration-150 hover:border-orange hover:bg-orange/14 hover:text-orange-bright aria-expanded:border-orange aria-expanded:bg-orange/13 aria-expanded:text-orange-bright"
      >
        <Icon name="git-commit" size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className="z-40">
          <Menu.Popup className="min-w-[180px] rounded-lg border-[0.5px] border-orange/40 bg-linear-160/srgb from-surface-2 to-surface p-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)] outline-none">
            {ACTIONS.map(({ label, icon }) => (
              <Menu.Item
                key={label}
                className="flex cursor-pointer items-center gap-2 rounded-[5px] px-2.5 py-[7px] text-body-sm text-cream outline-none select-none data-highlighted:bg-orange/12 data-highlighted:text-orange-bright"
              >
                <Icon name={icon} size={14} className="shrink-0 opacity-80" />
                {label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
