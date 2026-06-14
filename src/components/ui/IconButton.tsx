import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { Tooltip } from './Tooltip'

/**
 * ------------------------------------------------
 * Square icon-only button (absorbs the old icon-button utility, ADR-008-02/03).
 * `tooltip` wraps the button in styled Tooltip parts and doubles as the
 * accessible name — never pass `title` alongside it (ADR-008-08).
 */

const sizes = {
  md: 'h-[30px] w-[30px]',
  sm: 'h-[26px] w-[26px]'
}

interface IconButtonProps extends ComponentProps<'button'> {
  size?: keyof typeof sizes
  /** Styled tooltip label shown on hover/focus; also the aria-label. */
  tooltip?: string
}

export function IconButton({
  size = 'md',
  tooltip,
  className,
  type = 'button',
  'aria-label': ariaLabel,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={ariaLabel ?? tooltip}
      className={cn(
        'flex cursor-pointer items-center justify-center rounded-md border-[0.5px] border-line bg-orange/5 text-cream-dim transition-all duration-150 hover:border-orange hover:bg-orange/14 hover:text-orange-bright disabled:cursor-default disabled:opacity-40',
        sizes[size],
        className
      )}
      {...props}
    />
  )
  if (!tooltip) return button
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button} />
      <Tooltip.Popup>{tooltip}</Tooltip.Popup>
    </Tooltip.Root>
  )
}
