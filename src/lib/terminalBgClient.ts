import type { Settings } from '@shared/types'
import type { TerminalBgCopyResult } from '@shared/terminalBg'
import { defaultTerminalBackground } from '@/terminal/xtermTheme'

export function resolveTerminalBackgroundColor(settings: Settings): string {
  return settings.terminalBackgroundColor ?? defaultTerminalBackground(settings.terminalThemeId)
}

export async function copyTerminalBgFile(file: File): Promise<TerminalBgCopyResult> {
  const data = await file.arrayBuffer()
  return window.gc.terminalBg.copyUpload(data, file.type, file.name)
}

/** Copy new image, update settings, then delete the previous managed file. */
export async function replaceTerminalBgFile(
  previousFilename: string | null,
  file: File,
  onStored: (filename: string) => void
): Promise<TerminalBgCopyResult> {
  const result = await copyTerminalBgFile(file)
  if (!result.ok) return result

  onStored(result.filename)

  if (previousFilename) {
    await window.gc.terminalBg.deleteFile(previousFilename)
  }

  return result
}

export async function clearTerminalBgFile(filename: string | null): Promise<void> {
  if (!filename) return
  await window.gc.terminalBg.deleteFile(filename)
}
