import { Input as BaseInput } from '@base-ui/react/input'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * ------------------------------------------------
 * Text input (Base UI Input-backed). `field` absorbs the old settings input
 * utility verbatim (raw rgba gradient stops are a recorded plan exception,
 * ADR-008-03); `inline` is the compact rename style. Both carry `select-text`
 * because body sets `user-select: none`.
 */

const variants = {
  field:
    'h-10 w-[92px] rounded-lg border-[0.5px] border-cream/14 bg-linear-to-b/srgb from-[rgba(255,255,255,0.045)] to-[rgba(0,0,0,0.22)] px-3 font-sans text-body text-cream tabular-nums shadow-[inset_0_1px_0_rgba(255,168,96,0.06),0_1px_0_rgba(0,0,0,0.3)] outline-none transition-[border-color,box-shadow,background] duration-150 select-text hover:border-orange/35 hover:from-[rgba(255,255,255,0.06)] hover:to-[rgba(0,0,0,0.2)] focus-visible:border-orange-bright/75 focus-visible:shadow-[0_0_0_3px_rgba(255,134,54,0.15),inset_0_1px_0_rgba(255,168,96,0.08)] [&::-webkit-inner-spin-button]:opacity-60 [&::-webkit-outer-spin-button]:opacity-60',
  inline:
    'rounded-[5px] border-[0.5px] border-orange/50 bg-black/25 px-[5px] py-px text-body font-semibold text-cream outline-none select-text'
}

interface InputProps extends ComponentProps<typeof BaseInput> {
  variant?: keyof typeof variants
}

export function Input({ variant = 'field', className, ...props }: InputProps) {
  return <BaseInput className={cn(variants[variant], className)} {...props} />
}
