import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import {
  FONT_SIZE_BOUNDS,
  UI_BODY_FONTS,
  UI_HEADING_FONTS,
  TERMINAL_FONTS,
  type BodyFontId,
  type HeadingFontId,
  type TerminalFontId
} from '@shared/fonts'
import { DEFAULT_WORKTREE_DIRECTORY } from '@shared/settings'
import {
  APP_THEME_ORDER,
  appThemeLabel,
  appThemeTerminalPair,
  type AppThemeId
} from '@shared/appThemes'
import {
  TERMINAL_THEME_ORDER,
  terminalThemeLabel,
  type TerminalThemeId
} from '@shared/terminalThemes'
import { TerminalBackgroundSettings } from '@/components/TerminalBackgroundSettings'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { settingsHint, settingsLabel, settingsRow, settingsUnit } from '@/components/settingsUi'

const navItem =
  'cursor-pointer rounded-[7px] border-[0.5px] border-transparent px-2.5 py-2 text-left text-body font-medium transition-all duration-150'
const navItemIdle = 'bg-transparent text-cream-dim hover:bg-orange/8 hover:text-cream'
const navItemActive = 'bg-orange/12 text-cream'

/**
 * Full-page settings (PLAN 004). Swaps in for the workspace via the store's
 * `view` flag; the rail/titlebar/status bar stay.
 */
type SectionId = 'general' | 'appearance'

const SECTIONS: { id: SectionId; label: string; blurb: string }[] = [
  { id: 'general', label: 'General', blurb: 'App-wide preferences.' },
  { id: 'appearance', label: 'Appearance', blurb: 'Theme, fonts, and terminal background.' }
]

const HEADING_OPTIONS = Object.values(UI_HEADING_FONTS)
const BODY_OPTIONS = Object.values(UI_BODY_FONTS)
const TERMINAL_OPTIONS = Object.values(TERMINAL_FONTS)

function parseSize(raw: string, min: number, max: number): number | null {
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return null
  return Math.min(max, Math.max(min, n))
}

export function SettingsPage() {
  const [active, setActive] = useState<SectionId>('appearance')
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const [worktreeDirectoryDraft, setWorktreeDirectoryDraft] = useState(
    settings.worktreeDirectory
  )
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]

  useEffect(() => {
    setWorktreeDirectoryDraft(settings.worktreeDirectory)
  }, [settings.worktreeDirectory])

  return (
    <div className="flex min-w-0 flex-1 bg-(image:--grad-content)">
      <nav className="flex w-[220px] shrink-0 flex-col gap-1 border-r border-line-soft px-3 py-4">
        <div className="mb-2 border-b border-line-soft px-2 pb-3 font-display text-heading-sm font-bold glow-orange">
          Settings
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`${navItem} ${s.id === active ? navItemActive : navItemIdle}`}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-10 py-8 max-[760px]:px-6 max-[760px]:py-7">
        <header className="mb-[30px] border-b border-line-soft pb-5">
          <h2 className="font-display text-heading-md font-bold text-cream">{section.label}</h2>
          <p className="mt-1 text-body text-cream-dim">{section.blurb}</p>
        </header>

        {active === 'general' && (
          <div className="flex w-[min(100%,560px)] flex-col gap-[30px]">
            <fieldset className="flex flex-col gap-3.5 border-b border-line-soft pb-7 last:border-b-0 last:pb-0">
              <legend className="mb-0.5 font-display text-heading-sm font-bold text-cream">Git</legend>
              <label className={settingsRow}>
                <span className={settingsLabel}>Worktrees</span>
                <Input
                  className="w-[min(100%,360px)] [font-variant-numeric:normal]"
                  type="text"
                  value={worktreeDirectoryDraft}
                  onChange={(event) => setWorktreeDirectoryDraft(event.target.value)}
                  onBlur={() => {
                    const nextDirectory =
                      worktreeDirectoryDraft.trim() || DEFAULT_WORKTREE_DIRECTORY
                    setWorktreeDirectoryDraft(nextDirectory)
                    patchSettings({ worktreeDirectory: nextDirectory })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
              </label>
              <p className={settingsHint}>
                Default location for managed git worktrees.
              </p>
            </fieldset>
          </div>
        )}

        {active === 'appearance' && (
          <div className="flex w-[min(100%,560px)] flex-col gap-[30px]">
            <fieldset className="flex flex-col gap-3.5 border-b border-line-soft pb-7 last:border-b-0 last:pb-0">
              <legend className="mb-0.5 font-display text-heading-sm font-bold text-cream">App</legend>
              <div className={settingsRow}>
                <label className={settingsLabel} htmlFor="settings-app-theme">
                  Theme
                </label>
                <Select.Root
                  value={settings.appThemeId}
                  onValueChange={(value) => {
                    const appThemeId = value as AppThemeId
                    // Pairing: switch the terminal to the app theme's partner
                    // (app → terminal). Reset the bg override so the new
                    // palette's default backdrop shows.
                    patchSettings({
                      appThemeId,
                      terminalThemeId: appThemeTerminalPair(appThemeId),
                      terminalBackgroundColor: null
                    })
                  }}
                  items={APP_THEME_ORDER.map((id) => ({
                    value: id,
                    label: appThemeLabel(id)
                  }))}
                >
                  <Select.Trigger id="settings-app-theme" />
                  <Select.Popup>
                    {APP_THEME_ORDER.map((id) => (
                      <Select.Item key={id} value={id}>
                        {appThemeLabel(id)}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Root>
              </div>
              <p className={settingsHint}>
                The app follows the operating system’s light/dark setting. A
                manual pick holds until the OS next changes.
              </p>
            </fieldset>

            <fieldset className="flex flex-col gap-3.5 border-b border-line-soft pb-7 last:border-b-0 last:pb-0">
              <legend className="mb-0.5 font-display text-heading-sm font-bold text-cream">UI headings</legend>
              <div className={settingsRow}>
                <label className={settingsLabel} htmlFor="settings-heading-font">
                  Font
                </label>
                <Select.Root
                  value={settings.uiHeadingFontFamily}
                  onValueChange={(value) =>
                    patchSettings({ uiHeadingFontFamily: value as HeadingFontId })
                  }
                  items={HEADING_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
                >
                  <Select.Trigger id="settings-heading-font" />
                  <Select.Popup>
                    {HEADING_OPTIONS.map((f) => (
                      <Select.Item key={f.id} value={f.id}>
                        {f.label}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Root>
              </div>
              <label className={settingsRow}>
                <span className={settingsLabel}>Size</span>
                <Input
                  type="number"
                  min={FONT_SIZE_BOUNDS.uiHeading.min}
                  max={FONT_SIZE_BOUNDS.uiHeading.max}
                  value={settings.uiHeadingFontSize}
                  onChange={(e) => {
                    const n = parseSize(
                      e.target.value,
                      FONT_SIZE_BOUNDS.uiHeading.min,
                      FONT_SIZE_BOUNDS.uiHeading.max
                    )
                    if (n != null) patchSettings({ uiHeadingFontSize: n })
                  }}
                />
                <span className={settingsUnit}>px</span>
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-3.5 border-b border-line-soft pb-7 last:border-b-0 last:pb-0">
              <legend className="mb-0.5 font-display text-heading-sm font-bold text-cream">UI body</legend>
              <div className={settingsRow}>
                <label className={settingsLabel} htmlFor="settings-body-font">
                  Font
                </label>
                <Select.Root
                  value={settings.uiBodyFontFamily}
                  onValueChange={(value) =>
                    patchSettings({ uiBodyFontFamily: value as BodyFontId })
                  }
                  items={BODY_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
                >
                  <Select.Trigger id="settings-body-font" />
                  <Select.Popup>
                    {BODY_OPTIONS.map((f) => (
                      <Select.Item key={f.id} value={f.id}>
                        {f.label}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Root>
              </div>
              <label className={settingsRow}>
                <span className={settingsLabel}>Size</span>
                <Input
                  type="number"
                  min={FONT_SIZE_BOUNDS.uiBody.min}
                  max={FONT_SIZE_BOUNDS.uiBody.max}
                  value={settings.uiBodyFontSize}
                  onChange={(e) => {
                    const n = parseSize(
                      e.target.value,
                      FONT_SIZE_BOUNDS.uiBody.min,
                      FONT_SIZE_BOUNDS.uiBody.max
                    )
                    if (n != null) patchSettings({ uiBodyFontSize: n })
                  }}
                />
                <span className={settingsUnit}>px</span>
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-3.5 border-b border-line-soft pb-7 last:border-b-0 last:pb-0">
              <legend className="mb-0.5 font-display text-heading-sm font-bold text-cream">Terminal</legend>
              <div className={settingsRow}>
                <label className={settingsLabel} htmlFor="settings-terminal-theme">
                  Theme
                </label>
                <Select.Root
                  value={settings.terminalThemeId}
                  onValueChange={(value) =>
                    patchSettings({
                      terminalThemeId: value as TerminalThemeId,
                      terminalBackgroundColor: null
                    })
                  }
                  items={TERMINAL_THEME_ORDER.map((id) => ({
                    value: id,
                    label: terminalThemeLabel(id)
                  }))}
                >
                  <Select.Trigger id="settings-terminal-theme" />
                  <Select.Popup>
                    {TERMINAL_THEME_ORDER.map((id) => (
                      <Select.Item key={id} value={id}>
                        {terminalThemeLabel(id)}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Root>
              </div>
              <div className={settingsRow}>
                <label className={settingsLabel} htmlFor="settings-terminal-font">
                  Font
                </label>
                <Select.Root
                  value={settings.terminalFontFamily}
                  onValueChange={(value) =>
                    patchSettings({ terminalFontFamily: value as TerminalFontId })
                  }
                  items={TERMINAL_OPTIONS.map((f) => ({ value: f.id, label: f.label }))}
                >
                  <Select.Trigger id="settings-terminal-font" />
                  <Select.Popup>
                    {TERMINAL_OPTIONS.map((f) => (
                      <Select.Item key={f.id} value={f.id}>
                        {f.label}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Root>
              </div>
              <label className={settingsRow}>
                <span className={settingsLabel}>Size</span>
                <Input
                  type="number"
                  min={FONT_SIZE_BOUNDS.terminal.min}
                  max={FONT_SIZE_BOUNDS.terminal.max}
                  value={settings.terminalFontSize}
                  onChange={(e) => {
                    const n = parseSize(
                      e.target.value,
                      FONT_SIZE_BOUNDS.terminal.min,
                      FONT_SIZE_BOUNDS.terminal.max
                    )
                    if (n != null) patchSettings({ terminalFontSize: n })
                  }}
                />
                <span className={settingsUnit}>px</span>
              </label>

              <TerminalBackgroundSettings settings={settings} patchSettings={patchSettings} />

              <p className={settingsHint}>
                Background color, image, and opacity apply immediately, including while
                Settings is open. Terminal font size refits when you return to the
                workspace — or use the console zoom buttons for immediate size changes.
              </p>
            </fieldset>
          </div>
        )}
      </section>
    </div>
  )
}
