import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * ------------------------------------------------
 * List-tile shell (styled-only — ADR-008-02). The glow/matte split is
 * deliberate design, ported verbatim: glow tiles (project launcher) sit on
 * the brighter surface gradient with hover/selected glows; matte tiles
 * (session list) sit a tone darker with neutral elevation. Matte keeps a
 * constant 0.5px border across states; the heavier selected edge is an inset
 * ring (box-shadow), so selecting a tile no longer reflows its neighbours.
 */

const variants = {
  glow: {
    base: 'relative flex w-full cursor-pointer flex-row items-center gap-2.5 rounded-[10px] border-[0.5px] bg-linear-160/srgb from-surface-2 to-surface px-3.5 py-2 text-left transition-all duration-150 hover:border-orange/30 hover:shadow-[0_0_20px_-8px_var(--glow),inset_0_1px_0_rgba(255,168,96,0.1)]',
    idle: 'border-line shadow-[0_10px_30px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,168,96,0.06)]',
    selected:
      'border-orange/40 shadow-[0_0_30px_-8px_var(--glow),inset_0_1px_0_rgba(255,168,96,0.12)]'
  },
  matte: {
    base: 'relative flex cursor-pointer items-center gap-3 rounded-[10px] border-[0.5px] bg-linear-160/srgb from-surface to-bg px-3 py-[9px] transition-all duration-150',
    idle: 'border-line-dark shadow-[var(--shadow-card),inset_0_1px_0_var(--highlight-top)] hover:border-orange/30',
    selected:
      'border-orange/40 shadow-[inset_0_0_0_1.5px_rgba(255,168,96,0.4),0_0_14px_-8px_var(--glow-soft),inset_0_1px_0_rgba(255,168,96,0.08)]'
  }
}

interface CardProps extends ComponentProps<'div'> {
  variant: keyof typeof variants
  selected?: boolean
}

export function Card({ variant, selected = false, className, ...props }: CardProps) {
  const v = variants[variant]
  return <div className={cn(v.base, selected ? v.selected : v.idle, className)} {...props} />
}
