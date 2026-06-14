import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * ------------------------------------------------
 * Segmented radio group (absorbs the settings theme-segment class strings).
 * Real radio semantics: Tab focuses the group, arrow keys move and select
 * within it (a deliberate change from the old Tab-per-button model).
 */

function Root({ className, ...props }: ComponentProps<typeof BaseRadioGroup>) {
  return (
    <BaseRadioGroup
      className={cn(
        'inline-flex overflow-hidden rounded-lg border-[0.5px] border-cream/14 bg-linear-to-b/srgb from-[rgba(255,255,255,0.045)] to-[rgba(0,0,0,0.22)] shadow-[inset_0_1px_0_rgba(255,168,96,0.06),0_1px_0_rgba(0,0,0,0.3)]',
        className
      )}
      {...props}
    />
  )
}

function Item({ className, ...props }: ComponentProps<typeof Radio.Root>) {
  return (
    <Radio.Root
      className={cn(
        'cursor-pointer border-r-[0.5px] border-cream/12 bg-transparent px-4 py-2 text-body-sm font-semibold text-cream-dim transition-all duration-150 last:border-r-0 hover:bg-orange/8 hover:text-cream focus-visible:outline-none data-unchecked:focus-visible:shadow-[inset_0_0_0_2px_rgba(255,168,96,0.6)] data-checked:bg-orange/14 data-checked:text-orange-bright data-checked:shadow-[inset_0_-2px_0_var(--orange)]',
        className
      )}
      {...props}
    />
  )
}

export const RadioGroup = { Root, Item }
