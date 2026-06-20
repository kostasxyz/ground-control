import { useRef, useState } from 'react'
import type { Settings } from '@shared/types'
import { resolveTerminalStack } from '@shared/fonts'
import { terminalThemePalette } from '@shared/terminalThemes'
import { terminalBgAssetUrl } from '@shared/terminalBg'
import {
  replaceTerminalBgFile,
  resolveTerminalBackgroundColor
} from '@/lib/terminalBgClient'
import {
  settingsBtn,
  settingsLabel,
  settingsRow,
  settingsRowTop,
  settingsUnit
} from '@/components/settingsUi'
import { Slider } from '@/components/ui/Slider'

interface Props {
  settings: Settings
  patchSettings: (partial: Partial<Settings>) => void
}

const PREVIEW_ANSI_KEYS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const

const previewLine = 'truncate'

export function TerminalBackgroundSettings({ settings, patchSettings }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const resolvedColor = resolveTerminalBackgroundColor(settings)
  const imageFilename = settings.terminalBackgroundImage
  const terminalStack = resolveTerminalStack(settings.terminalFontFamily)
  const palette = terminalThemePalette(settings.terminalThemeId)
  const dimColor = palette.brightBlack

  async function onImageSelected(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      const result = await replaceTerminalBgFile(
        settings.terminalBackgroundImage,
        file,
        (filename) => patchSettings({ terminalBackgroundImage: filename })
      )
      if (!result.ok) setUploadError(result.error)
    } finally {
      setUploading(false)
    }
  }

  async function onClearImage(): Promise<void> {
    setUploadError(null)
    const previous = settings.terminalBackgroundImage
    if (previous) {
      const result = await window.gc.terminalBg.deleteFile(previous)
      if (!result.ok) {
        setUploadError(result.error)
        return
      }
    }
    patchSettings({ terminalBackgroundImage: null })
  }

  return (
    <>
      <div
        className="overflow-hidden rounded-[10px] border-[0.5px] border-line shadow-[inset_0_1px_0_rgba(255,168,96,0.05)]"
        aria-hidden="true"
      >
        {/* before:* is the background-image layer, mirroring the console body */}
        <div
          className="relative min-h-[118px] px-3 py-2.5 before:pointer-events-none before:absolute before:inset-0 before:bg-(image:--term-bg-image) before:bg-cover before:bg-center before:bg-no-repeat before:opacity-(--term-bg-opacity)"
          style={{ backgroundColor: resolvedColor }}
        >
          <div
            className="relative z-[1] flex flex-col gap-1 text-[calc(var(--text-body-sm)*0.95)] leading-[1.45]"
            style={{ fontFamily: terminalStack, fontWeight: 500, color: palette.foreground }}
          >
            <div className={previewLine}>
              <span style={{ color: palette.cyan }}>~/ground-control</span>
              <span
                className="rounded-[1px]"
                style={{ color: palette.cursor, backgroundColor: palette.cursorAccent }}
              >
                {' '}
                ❯
              </span>
            </div>
            <div className={previewLine} style={{ color: dimColor }}>
              agent ready
            </div>
            <div
              className={`${previewLine} -mx-0.5 rounded-[3px] px-0.5`}
              style={{
                color: palette.selectionForeground ?? palette.foreground,
                backgroundColor: palette.selectionBackground
              }}
            >
              <span style={{ color: palette.green }}>✓</span> preview backdrop
            </div>
            <div className="mt-1 flex gap-[5px]" aria-hidden="true">
              {PREVIEW_ANSI_KEYS.map((key) => (
                <span
                  key={key}
                  className="h-3 w-3 flex-none rounded-[2px] border-[0.5px] border-white/12"
                  style={{ backgroundColor: palette[key] }}
                  title={key}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={settingsRow}>
        <span className={settingsLabel}>Background color</span>
        <div className="flex flex-wrap items-center gap-3">
          {/* The real <input type="color"> is the swatch: a transparent overlay
              over the colored preview. A genuine click on it opens the native
              picker reliably — a hidden, zero-size, pointer-events:none input
              triggered via .click() does not in Chromium/Electron. */}
          <div className="group relative h-10 w-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg border-[0.5px] border-cream/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] group-hover:border-orange/45"
              style={{ backgroundColor: resolvedColor }}
            />
            <input
              type="color"
              aria-label="Terminal background color"
              title="Pick background color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={resolvedColor.toLowerCase()}
              onChange={(e) => patchSettings({ terminalBackgroundColor: e.target.value })}
            />
          </div>
          {settings.terminalBackgroundColor && (
            <button
              type="button"
              className="cursor-pointer bg-transparent p-0 text-body-sm text-orange-bright hover:text-orange hover:underline"
              onClick={() => patchSettings({ terminalBackgroundColor: null })}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>

      <div className={settingsRowTop}>
        <span className={settingsLabel}>Background image</span>
        <div className="flex min-w-0 flex-col gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onImageSelected(e)}
          />
          {imageFilename && (
            <img
              className="h-[72px] w-[120px] rounded-lg border-[0.5px] border-line object-cover"
              src={terminalBgAssetUrl(imageFilename)}
              alt=""
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={settingsBtn}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : imageFilename ? 'Replace' : 'Upload'}
            </button>
            {imageFilename && (
              <button
                type="button"
                className={`${settingsBtn} bg-none`}
                disabled={uploading}
                onClick={() => void onClearImage()}
              >
                Clear
              </button>
            )}
          </div>
          {uploadError && (
            <p className="m-0 text-body-2xs leading-[1.45] text-ember">{uploadError}</p>
          )}
        </div>
      </div>

      {imageFilename && (
        <div className={settingsRow}>
          <span className={settingsLabel}>Image opacity</span>
          <Slider
            className="w-[min(100%,220px)]"
            aria-label="Image opacity"
            min={0}
            max={100}
            value={settings.terminalBackgroundOpacity}
            onValueChange={(value) =>
              patchSettings({ terminalBackgroundOpacity: value as number })
            }
          />
          <span className={settingsUnit}>{settings.terminalBackgroundOpacity}%</span>
        </div>
      )}
    </>
  )
}
