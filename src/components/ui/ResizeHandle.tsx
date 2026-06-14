import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/cn'

/**
 * ------------------------------------------------
 * Options for the useResizeHandle hook.
 */
export interface UseResizeHandleOptions {
  /** 'vertical' for a vertical separator dragged horizontally (col-resize);
   *  'horizontal' for a horizontal separator dragged vertically (row-resize). */
  orientation: 'vertical' | 'horizontal'
  /** Called with the raw pointer delta every move frame during drag. For
   *  'vertical' the delta is clientX - startX; for 'horizontal' it is
   *  clientY - startY. The call site applies its own sign and value math. */
  onMove: (delta: number) => void
  /** Called at drag start. Return false to cancel the drag (e.g. missing
   *  DOM measurements). */
  onDragStart?: () => boolean | void
  /** Called after the drag ends (pointer up). */
  onDragEnd?: () => void
}

/**
 * ------------------------------------------------
 * Result of the useResizeHandle hook.
 */
export interface UseResizeHandleResult {
  /** Attach to the handle element's onPointerDown. */
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** True while a drag is in progress. Used by call sites to disable CSS
   *  transitions during drag. */
  dragging: boolean
}

/**
 * ------------------------------------------------
 * Hook managing pointer-drag resize mechanics. Owns setPointerCapture,
 * body cursor/userSelect toggling, window pointermove/pointerup
 * lifecycle, and dragging state. Reports raw pointer movement (a delta)
 * for the given orientation; each call site interprets the delta and
 * owns its own value math and persistence.
 *
 * Externalises the drag handle element — the call site receives
 * onPointerDown (attach to the separator's JSX) and dragging (for CSS
 * transitions).
 *
 * @param {UseResizeHandleOptions} options - Orientation, callbacks.
 * @returns {UseResizeHandleResult} onPointerDown handler and dragging flag.
 */
export function useResizeHandle({
  orientation,
  onMove,
  onDragStart,
  onDragEnd
}: UseResizeHandleOptions): UseResizeHandleResult {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(0)
  const handleRef = useRef<HTMLDivElement | null>(null)
  const pointerIdRef = useRef(0)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()

      // Let the call site bail out (e.g. missing DOM references).
      if (onDragStart) {
        const proceed = onDragStart()
        if (proceed === false) return
      }

      handleRef.current = e.currentTarget
      pointerIdRef.current = e.pointerId
      handleRef.current.setPointerCapture(pointerIdRef.current)
      startRef.current = orientation === 'vertical' ? e.clientX : e.clientY
      document.body.style.cursor =
        orientation === 'vertical' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      setDragging(true)

      const handleMove = (ev: PointerEvent): void => {
        const current = orientation === 'vertical' ? ev.clientX : ev.clientY
        onMove(current - startRef.current)
      }

      const handleUp = (): void => {
        if (handleRef.current) {
          handleRef.current.releasePointerCapture(pointerIdRef.current)
          handleRef.current = null
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setDragging(false)
        onDragEnd?.()
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [orientation, onMove, onDragStart, onDragEnd]
  )

  return { onPointerDown, dragging }
}

/**
 * ------------------------------------------------
 * Props for the ResizeHandle separator component.
 */
export interface ResizeHandleProps {
  /** 'vertical' (col-resize) or 'horizontal' (row-resize). */
  orientation: 'vertical' | 'horizontal'
  /** Pointer-down handler from useResizeHandle. */
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** Double-click handler (reset to default). */
  onDoubleClick: () => void
  /** Accessible label for the separator role. */
  ariaLabel: string
  /** Extra CSS classes. */
  className?: string
  /** Inline styles (e.g. display:none). */
  style?: CSSProperties
}

/**
 * ------------------------------------------------
 * A styled, accessible separator handle for drag-to-resize. Uses the
 * after:* pseudo-element to widen the hit target without widening the
 * visible 1px line. Owns the visual appearance (hover/active, line color,
 * cursor, transition); the hook owns the mechanics.
 *
 * @param {ResizeHandleProps} props - Orientation, handlers, accessibility.
 * @returns {JSX.Element} The separator element.
 */
export function ResizeHandle({
  orientation,
  onPointerDown,
  onDoubleClick,
  ariaLabel,
  className,
  style
}: ResizeHandleProps) {
  return (
    <div
      className={cn(
        'relative flex-[0_0_1px] touch-none bg-line transition-colors duration-150 after:absolute hover:bg-orange active:bg-orange',
        orientation === 'vertical'
          ? 'cursor-col-resize self-stretch after:inset-y-0 after:-inset-x-[5px]'
          : 'cursor-row-resize after:inset-x-0 after:-inset-y-[5px]',
        className
      )}
      style={style}
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  )
}