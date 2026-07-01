import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * ------------------------------------------------
 * Text button (styled-only — Base UI has no Button part; ADR-008-02).
 * Variants absorb the old `ctrl` / `dialog-btn*` utilities verbatim
 * (ADR-008-03); `dialogPrimary`/`dialogDanger` compose the `dialog` base so
 * callers pass exactly one variant. `primary` was flattened off the old glossy
 * gradient `btn-primary` to a flat orange-accent fill (matches the terminal
 * tabs), dropping the drop-shadow/inset-highlight that read as 3D.
 */

const dialogBase =
  'h-7 cursor-pointer rounded-md border-[0.5px] border-line bg-orange/5 px-3.5 text-body-sm font-semibold text-cream transition-all duration-150 hover:not-disabled:border-orange hover:not-disabled:bg-orange/12 focus-visible:not-disabled:border-orange focus-visible:not-disabled:bg-orange/12 focus-visible:outline-none disabled:cursor-default disabled:opacity-45'

const variants = {
  ctrl: 'flex h-7 cursor-pointer items-center gap-[7px] rounded-md border-[0.5px] border-line bg-orange/5 px-2.5 text-body-sm font-semibold text-cream transition-all duration-150 hover:not-disabled:border-orange hover:not-disabled:bg-orange/13 hover:not-disabled:text-orange-bright focus-visible:not-disabled:border-orange focus-visible:not-disabled:bg-orange/13 focus-visible:not-disabled:text-orange-bright focus-visible:outline-none disabled:cursor-default disabled:opacity-55',
  primary:
    'inline-flex cursor-pointer items-center gap-1.5 rounded-md border-[0.5px] border-orange bg-orange/13 px-[13px] py-[5px] text-body-sm font-semibold text-orange-bright transition-all duration-150 hover:not-disabled:bg-orange/20 disabled:cursor-default disabled:opacity-45',
  dialog: dialogBase,
  dialogPrimary: cn(
    dialogBase,
    'border-orange/50 bg-orange/14 text-orange-bright hover:not-disabled:bg-orange/24 focus-visible:not-disabled:bg-orange/24'
  ),
  dialogDanger: cn(
    dialogBase,
    'border-ember/45 bg-ember/8 text-ember hover:not-disabled:border-ember hover:not-disabled:bg-ember/16 focus-visible:not-disabled:border-ember focus-visible:not-disabled:bg-ember/16'
  )
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: keyof typeof variants
}

export function Button({ variant = 'ctrl', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(variants[variant], className)} {...props} />
}
