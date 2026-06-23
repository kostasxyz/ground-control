/**
 * Shared utility-class strings for the settings page (SettingsPage +
 * TerminalBackgroundSettings). The row grid collapses to two columns under
 * 760px, with the label spanning the full first line.
 */
export const settingsRow =
  'grid min-h-[42px] grid-cols-[116px_minmax(180px,1fr)_max-content] items-center gap-3.5 max-[760px]:grid-cols-[1fr_max-content] max-[760px]:gap-x-2.5 max-[760px]:gap-y-2'
export const settingsRowTop = settingsRow.replace('items-center', 'items-start')
export const settingsLabel = 'text-body-sm font-semibold text-cream-dim max-[760px]:col-span-full'
export const settingsUnit = 'text-body-2xs text-cream-ghost'
export const settingsHint =
  'mt-0.5 ml-[130px] max-w-[340px] text-body-2xs leading-normal text-cream-ghost max-[760px]:ml-0'
export const settingsBtn =
  'h-9 cursor-pointer rounded-md border-[0.5px] border-line bg-orange/5 px-3.5 text-body-sm font-semibold text-cream transition-all duration-150 hover:not-disabled:border-orange/40 hover:not-disabled:bg-orange/[0.09] disabled:cursor-default disabled:opacity-55'
