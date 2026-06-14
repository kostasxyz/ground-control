import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '../Icon'

/**
 * ------------------------------------------------
 * Styled Base UI Checkbox (replaces the native `accent-orange` input).
 * Controlled via `checked`/`onCheckedChange`; renders a button, so an
 * implicit `<label>` wrap keeps working as the click target.
 */
export function Checkbox({ className, ...props }: ComponentProps<typeof BaseCheckbox.Root>) {
  return (
    <BaseCheckbox.Root
      className={cn(
        'flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-[0.5px] border-line bg-orange/5 transition-all duration-150 hover:border-orange/60 focus-visible:shadow-[0_0_0_3px_rgba(255,134,54,0.25)] focus-visible:outline-none data-checked:border-orange-bright data-checked:bg-orange',
        className
      )}
      {...props}
    >
      <BaseCheckbox.Indicator className="flex items-center justify-center text-ink">
        <Icon name="check" size={10} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}
