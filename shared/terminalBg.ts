/** Terminal background image constants (PLAN §11). */

export const TERMINAL_BG_PROTOCOL = 'groundcontrol'
export const TERMINAL_BG_HOST = 'terminal-bg'
export const TERMINAL_BG_DIR = 'terminal-bg'
export const TERMINAL_BG_MAX_BYTES = 5 * 1024 * 1024

export const TERMINAL_BG_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type TerminalBgMime = (typeof TERMINAL_BG_MIME_TYPES)[number]

export const TERMINAL_BG_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

const MIME_BY_EXT: Record<string, TerminalBgMime> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

export function isTerminalBgMime(mime: string): mime is TerminalBgMime {
  return (TERMINAL_BG_MIME_TYPES as readonly string[]).includes(mime)
}

export function terminalBgExtensionForMime(mime: TerminalBgMime): '.png' | '.jpg' | '.webp' {
  switch (mime) {
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/jpeg':
      return '.jpg'
  }
}

export function terminalBgMimeForExtension(ext: string): TerminalBgMime | null {
  return MIME_BY_EXT[ext.toLowerCase()] ?? null
}

/** Managed filename only — reject path segments and traversal. */
export function isSafeTerminalBgFilename(filename: string): boolean {
  if (!filename || filename.length > 200) return false
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false
  return /^[a-zA-Z0-9._-]+$/.test(filename)
}

export function terminalBgAssetUrl(filename: string): string {
  return `${TERMINAL_BG_PROTOCOL}://${TERMINAL_BG_HOST}/${encodeURIComponent(filename)}`
}

export function terminalBgCssUrl(filename: string): string {
  return `url("${terminalBgAssetUrl(filename)}")`
}

export type TerminalBgCopyResult =
  | { ok: true; filename: string }
  | { ok: false; error: string }

export type TerminalBgDeleteResult = { ok: true } | { ok: false; error: string }
