import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type PositionerProps = ComponentProps<typeof BaseTooltip.Positioner>
type Side = NonNullable<PositionerProps['side']>
type Align = NonNullable<PositionerProps['align']>

interface PopupProps extends ComponentProps<typeof BaseTooltip.Popup> {
  /** Edge of the trigger the popup anchors to (defaults to top). */
  side?: Side
  /** Alignment along the chosen edge (defaults to center). */
  align?: Align
}

/**
 * ------------------------------------------------
 * Styled Base UI Tooltip parts (ADR-008-08). `Provider` wraps the app root
 * once for shared delay grouping; `Popup` bundles Portal + Positioner so
 * consumers compose Root > Trigger + Popup.
 */
function Popup({ className, side, align, children, ...props }: PopupProps) {
  return (
    <BaseTooltip.Portal>
      {/* z-50: tooltips must paint above dialog backdrops (also z-50; the
          body-level portal wins on document order). */}
      <BaseTooltip.Positioner side={side} align={align} sideOffset={6} className="z-50">
        <BaseTooltip.Popup
          className={cn(
            'rounded-md border-[0.5px] border-orange/40 bg-linear-160/srgb from-surface-2 to-surface px-2 py-1 text-body-2xs text-cream shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]',
            className
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}

export const Tooltip = {
  Provider: BaseTooltip.Provider,
  Root: BaseTooltip.Root,
  Trigger: BaseTooltip.Trigger,
  Popup
}
