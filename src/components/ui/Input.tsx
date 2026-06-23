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
  // Streamlined to match the settings Select field: flat, slim, accent-tinted.
  field:
    'h-9 w-[92px] rounded-md border-[0.5px] border-line bg-orange/5 px-3 font-sans text-body text-cream tabular-nums outline-none transition-all duration-150 select-text hover:border-orange/40 hover:bg-orange/[0.09] focus-visible:border-orange-bright/70 focus-visible:bg-orange/[0.09] [&::-webkit-inner-spin-button]:opacity-60 [&::-webkit-outer-spin-button]:opacity-60',
  inline:
    'rounded-[5px] border-[0.5px] border-orange/50 bg-black/25 px-[5px] py-px text-body font-semibold text-cream outline-none select-text'
}

interface InputProps extends ComponentProps<typeof BaseInput> {
  variant?: keyof typeof variants
}

export function Input({ variant = 'field', className, ...props }: InputProps) {
  return <BaseInput className={cn(variants[variant], className)} {...props} />
}
