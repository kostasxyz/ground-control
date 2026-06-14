import { initials } from '@/lib/constants'

/**
 * ------------------------------------------------
 * The project chip from the workspace rail (flat orange square + two-letter
 * initials), reused at smaller sizes in the titlebar project switcher dropdown
 * items so both read as the same object. The trigger passes `dot` to mark the
 * active project with a bare status dot (the terminal-tab teal) instead.
 */

const sizes = {
  sm: 'h-[18px] w-[18px] rounded-[5px] text-[9px]',
  md: 'h-[22px] w-[22px] rounded-[6px] text-[10px]'
}

export function ProjectPin({
  name,
  size = 'sm',
  dot = false,
  className = ''
}: {
  name: string
  size?: keyof typeof sizes
  /** Render a bare status dot instead of the boxed initials (active project). */
  dot?: boolean
  className?: string
}) {
  if (dot) {
    return <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full bg-teal ${className}`} />
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center border-[0.5px] border-orange bg-orange/13 font-display font-extrabold text-orange-bright ${sizes[size]} ${className}`}
    >
      {initials(name)}
    </span>
  )
}
