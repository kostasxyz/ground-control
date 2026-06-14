import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

// --- Webview zoom (Cmd/Ctrl +/-/0) ------------------------------------------
// Tauri doesn't bind browser-style zoom hotkeys, so we wire them ourselves to
// the webview's native zoom (setZoom → plugin:webview|set_webview_zoom, gated by
// core:webview:allow-set-webview-zoom). The level is persisted to localStorage
// (mirroring the theme seed in bridge.ts) and restored on launch, since native
// zoom otherwise resets to 1.0 each session.

const ZOOM_KEY = 'gc:zoom'
const MIN = 0.5
const MAX = 3
const STEP = 0.1
const DEFAULT = 1

/** Clamp to the supported range and snap to 2dp (avoids float drift on repeat). */
function clamp(z: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100))
}

function readZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY))
    return Number.isFinite(z) && z > 0 ? clamp(z) : DEFAULT
  } catch {
    return DEFAULT
  }
}

let current = readZoom()

/** Apply a zoom factor (clamped), persist it for next launch, and push it to the
 *  native webview. Failures (e.g. browser smoke mode) are non-fatal. */
export function applyZoom(factor: number): void {
  current = clamp(factor)
  try {
    localStorage.setItem(ZOOM_KEY, String(current))
  } catch {
    /* ignore */
  }
  void getCurrentWebviewWindow()
    .setZoom(current)
    .catch(() => {})
}

/** Restore the persisted zoom and bind Cmd/Ctrl +/-/0. Capture phase so it runs
 *  before the terminal (xterm) swallows the keys. Returns a cleanup fn. */
export function setupZoom(): () => void {
  applyZoom(current)

  const isMac = window.gc.system.platform === 'darwin'
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (!mod || e.altKey) return
    let next: number | null = null
    if (e.key === '=' || e.key === '+') next = current + STEP
    else if (e.key === '-' || e.key === '_') next = current - STEP
    else if (e.key === '0') next = DEFAULT
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    applyZoom(next)
  }

  window.addEventListener('keydown', onKeyDown, { capture: true })
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
}
