import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '../Icon'
import { IconButton } from './IconButton'

/**
 * ------------------------------------------------
 * Styled Base UI Dialog parts (ADR-008-05). Controlled-only where state
 * exists (`open`/`onOpenChange`); portals to <body> at z-50; focus trap,
 * focus restore, and outside-press dismiss are Base UI defaults kept
 * deliberately (ADR-008-06).
 */

function Popup({ className, children, ...props }: ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      {/* rgba literal moved verbatim from the old dialog-backdrop utility
          (theme-blind today; tokenizing is a recorded follow-up, ADR-008-03). */}
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-[rgba(8,5,3,0.55)] backdrop-blur-[2px]" />
      <BaseDialog.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border-[0.5px] border-orange/40 bg-linear-160/srgb from-surface-2 to-surface p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,168,96,0.1)]',
          className
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}

/** Header row: Title on the left, CloseX on the right. */
function Header({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-between', className)} {...props} />
}

function Title({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn('text-body-md font-semibold text-cream', className)}
      {...props}
    />
  )
}

function Description({ className, ...props }: ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn('mt-1 mb-3.5 text-body-sm text-cream-dim', className)}
      {...props}
    />
  )
}

/** The header ✕ button every app dialog carries. */
function CloseX(props: ComponentProps<typeof BaseDialog.Close>) {
  return (
    <BaseDialog.Close
      render={
        <IconButton tooltip="Close">
          <Icon name="close" size={14} />
        </IconButton>
      }
      {...props}
    />
  )
}

function Footer({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-1 flex justify-end gap-2', className)} {...props} />
}

export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Popup,
  Header,
  Title,
  Description,
  CloseX,
  Close: BaseDialog.Close,
  Footer
}
