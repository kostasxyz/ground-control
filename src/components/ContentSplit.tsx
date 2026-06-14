import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/state/store'
import { clampSessionsWidth, SESSIONS_PANE_DEFAULT } from '@/lib/constants'
import { useResizeHandle, ResizeHandle } from '@/components/ui/ResizeHandle'
import { SessionsPane } from './SessionsPane'
import { ConsolePane } from './ConsolePane'

/**
 * The sessions↔console split. The sessions pane is width-controlled via the
 * `--sessions-w` custom property; the divider drags that width. Kept in its own
 * component so per-frame width updates re-render only this subtree (not the
 * titlebar/rail/status bar). The active terminal refits automatically — its
 * ResizeObserver fires as the console body changes size.
 */
export function ContentSplit({ hidden = false }: { hidden?: boolean }) {
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const width = settings.sessionsPaneWidth ?? SESSIONS_PANE_DEFAULT
  const setWidth = useCallback(
    (px: number) => patchSettings({ sessionsPaneWidth: px }),
    [patchSettings]
  )
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Re-clamp if the window shrinks enough that the console would be squeezed.
  useEffect(() => {
    const onResize = (): void => {
      const content = contentRef.current
      if (!content) return
      const clamped = clampSessionsWidth(width, content.clientWidth)
      if (clamped !== width) setWidth(clamped)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width, setWidth])

  const { onPointerDown } = useResizeHandle({
    orientation: 'vertical',
    onMove: (delta) => {
      const content = contentRef.current
      if (content) setWidth(clampSessionsWidth(width + delta, content.clientWidth))
    }
  })

  return (
    <div
      className="flex min-w-0 flex-1 bg-(image:--grad-content)"
      ref={contentRef}
      // Hidden (not unmounted) when settings is open, so live PTYs survive — the
      // terminal's mount/unmount is tied 1:1 to PTY lifecycle (ADR-0008).
      style={
        { '--sessions-w': `${width}px`, display: hidden ? 'none' : undefined } as CSSProperties
      }
    >
      <SessionsPane />
      <ResizeHandle
        orientation="vertical"
        ariaLabel="Resize sessions panel"
        onPointerDown={onPointerDown}
        onDoubleClick={() => {
          const content = contentRef.current
          if (content) setWidth(clampSessionsWidth(SESSIONS_PANE_DEFAULT, content.clientWidth))
        }}
      />
      <ConsolePane />
    </div>
  )
}
