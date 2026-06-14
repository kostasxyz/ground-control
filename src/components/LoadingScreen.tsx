import iconUrl from '@/assets/icon.png'

/**
 * ------------------------------------------------
 * Boot splash shown while persisted state loads (App gates on `ready`). Mirrors
 * the shell's themed gradient + grain so it dissolves seamlessly into the app,
 * and is draggable so the frameless window can be moved while it loads.
 * @returns {JSX.Element} Loading screen element.
 */
export function LoadingScreen() {
  return (
    <div data-tauri-drag-region className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden bg-linear-to-b/srgb from-surface-2 to-surface">
      <div className="grain" />
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* Breathing glow behind the mark; the icon itself stays crisp. */}
        <div className="absolute inset-2 animate-led-pulse rounded-full bg-glow blur-2xl" aria-hidden />
        <img src={iconUrl} alt="" draggable={false} className="relative h-28 w-28 select-none" />
      </div>
      <div className="flex items-center gap-1 font-display text-heading-sm font-extrabold tracking-[0.02em]">
        <span className="glow-orange">GROUND</span>
        <span className="text-cream">CONTROL</span>
      </div>
    </div>
  )
}
