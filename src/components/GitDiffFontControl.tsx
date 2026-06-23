import { GIT_DIFF_FONT_MAX, GIT_DIFF_FONT_MIN } from '@/lib/constants'
import { Icon } from './Icon'
import { IconButton } from './ui/IconButton'

interface GitDiffFontControlProps {
  /** Current effective diff code font size (px). */
  size: number
  /** Step the font size by `delta` px (clamped by the parent). */
  onZoom(delta: number): void
  /** Reset the diff code font size back to the terminal font size. */
  onReset(): void
}

/**
 * ------------------------------------------------
 * Compact A−/A+ control for the Git diff viewer code font size. The middle
 * size readout doubles as a reset button (click to follow the terminal font
 * size again). Buttons disable at the supported bounds.
 * @param {GitDiffFontControlProps} props - Component props.
 * @returns {JSX.Element} Font size control.
 */
export function GitDiffFontControl({ size, onZoom, onReset }: GitDiffFontControlProps) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        tooltip="Decrease code font size"
        size="sm"
        onClick={() => onZoom(-1)}
        disabled={size <= GIT_DIFF_FONT_MIN}
      >
        <Icon name="zoom-out" size={14} />
      </IconButton>
      <button
        type="button"
        onClick={onReset}
        title="Reset code font size"
        className="min-w-[2.25ch] cursor-pointer rounded px-1 text-center font-terminal text-body-2xs tabular-nums text-cream-ghost transition-colors duration-150 hover:text-cream"
      >
        {size}
      </button>
      <IconButton
        tooltip="Increase code font size"
        size="sm"
        onClick={() => onZoom(1)}
        disabled={size >= GIT_DIFF_FONT_MAX}
      >
        <Icon name="zoom-in" size={14} />
      </IconButton>
    </div>
  )
}
