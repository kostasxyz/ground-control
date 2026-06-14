import { Slider as BaseSlider } from '@base-ui/react/slider'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * ------------------------------------------------
 * Styled single-thumb Base UI Slider (replaces the native `accent-orange`
 * range input). Controlled via `value`/`onValueChange`; keyboard arrows
 * nudge by `step`.
 */
export function Slider({ className, ...props }: ComponentProps<typeof BaseSlider.Root>) {
  return (
    <BaseSlider.Root className={cn('w-full', className)} {...props}>
      <BaseSlider.Control className="flex w-full touch-none items-center py-1.5 select-none">
        <BaseSlider.Track className="h-1 w-full rounded-full bg-cream/14 select-none">
          <BaseSlider.Indicator className="rounded-full bg-orange select-none" />
          <BaseSlider.Thumb className="h-3.5 w-3.5 rounded-full bg-orange-bright shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.4)] outline-none select-none focus-visible:shadow-[0_0_0_3px_rgba(255,134,54,0.3)]" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}
