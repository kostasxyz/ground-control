import { Select as BaseSelect } from '@base-ui/react/select'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '../Icon'

/**
 * ------------------------------------------------
 * Styled Base UI Select parts (ADR-008-05). The `field` Trigger carries the
 * settings-field look (absorbing the old plain-CSS settings select); `bare`
 * leaves styling to the caller (compact toolbar dropdowns own their look).
 * Popup portals to <body> at z-40 (below dialogs' z-50; callers inside a
 * dialog raise it via `positionerClassName`). Menus open below the trigger,
 * matching the app's existing dropdown placement (alignItemWithTrigger off).
 */

const triggerVariants = {
  // Streamlined settings field: flat, slim, accent-tinted — the app's shared
  // control language (border-line + bg-orange/5), not a raised gradient pill.
  field:
    'group/trigger flex h-9 cursor-pointer items-center gap-2 rounded-md border-[0.5px] border-line bg-orange/5 px-3 text-left font-sans text-body text-cream outline-none transition-all duration-150 hover:border-orange/40 hover:bg-orange/[0.09] focus-visible:border-orange-bright/70 focus-visible:bg-orange/[0.09] aria-expanded:border-orange aria-expanded:bg-orange/12',
  bare: 'group/trigger'
}

const chevronVariants = {
  field:
    'text-cream-dim group-hover/trigger:text-orange-bright group-aria-expanded/trigger:text-orange-bright',
  bare: 'opacity-70'
}

interface TriggerProps extends ComponentProps<typeof BaseSelect.Trigger> {
  variant?: keyof typeof triggerVariants
}

function Trigger({ variant = 'field', className, children, ...props }: TriggerProps) {
  return (
    <BaseSelect.Trigger className={cn(triggerVariants[variant], className)} {...props}>
      {children ?? <BaseSelect.Value className="min-w-0 flex-1 truncate" />}
      <BaseSelect.Icon
        className={cn('ml-auto flex shrink-0 items-center', chevronVariants[variant])}
      >
        <Icon name="chevron-down" size={12} />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  )
}

interface PopupProps extends ComponentProps<typeof BaseSelect.Popup> {
  /** Extra classes on the Positioner — e.g. `z-50` when the select lives inside a dialog. */
  positionerClassName?: string
}

function Popup({ className, children, positionerClassName, ...props }: PopupProps) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        sideOffset={4}
        alignItemWithTrigger={false}
        className={cn('z-40', positionerClassName)}
      >
        <BaseSelect.Popup
          className={cn(
            'max-h-60 min-w-[var(--anchor-width)] max-w-[280px] overflow-y-auto rounded-lg border-[0.5px] border-orange/40 bg-linear-160/srgb from-surface-2 to-surface p-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]',
            className
          )}
          {...props}
        >
          {children}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  )
}

interface ItemProps extends ComponentProps<typeof BaseSelect.Item> {
  /** Rendered before the label — e.g. a per-option icon/chip. */
  leading?: ReactNode
  /** Rendered after the label — e.g. a per-option action button. */
  trailing?: ReactNode
}

function Item({ className, children, leading, trailing, ...props }: ItemProps) {
  return (
    <BaseSelect.Item
      className={cn(
        'group/opt flex cursor-pointer items-center gap-1.5 rounded-[5px] px-2 py-[5px] text-body-sm text-cream select-none data-highlighted:bg-orange/12 data-highlighted:text-orange-bright',
        className
      )}
      {...props}
    >
      {/* Fixed-width slot keeps labels aligned whether or not selected. */}
      <span className="flex w-3 shrink-0 items-center text-orange" aria-hidden>
        <BaseSelect.ItemIndicator>
          <Icon name="check" size={12} />
        </BaseSelect.ItemIndicator>
      </span>
      {leading}
      <BaseSelect.ItemText className="min-w-0 flex-1 truncate">{children}</BaseSelect.ItemText>
      {trailing}
    </BaseSelect.Item>
  )
}

export const Select = {
  Root: BaseSelect.Root,
  Trigger,
  Value: BaseSelect.Value,
  Popup,
  Item
}
