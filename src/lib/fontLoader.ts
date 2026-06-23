import type { Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { BodyFontId, HeadingFontId, TerminalFontId } from '@shared/fonts'

type FontLoader = () => Promise<unknown>

const FONT_LOADERS = {
  unbounded: [
    () => import('@fontsource/unbounded/500.css'),
    () => import('@fontsource/unbounded/700.css'),
    () => import('@fontsource/unbounded/800.css')
  ],
  outfit: [
    () => import('@fontsource/outfit/400.css'),
    () => import('@fontsource/outfit/500.css'),
    () => import('@fontsource/outfit/700.css')
  ],
  'dm-sans': [
    () => import('@fontsource/dm-sans/400.css'),
    () => import('@fontsource/dm-sans/500.css'),
    () => import('@fontsource/dm-sans/700.css')
  ],
  'plus-jakarta': [
    () => import('@fontsource/plus-jakarta-sans/400.css'),
    () => import('@fontsource/plus-jakarta-sans/500.css'),
    () => import('@fontsource/plus-jakarta-sans/700.css')
  ],
  sora: [
    () => import('@fontsource/sora/400.css'),
    () => import('@fontsource/sora/500.css'),
    () => import('@fontsource/sora/700.css')
  ],
  manrope: [
    () => import('@fontsource/manrope/400.css'),
    () => import('@fontsource/manrope/500.css'),
    () => import('@fontsource/manrope/700.css')
  ],
  lexend: [
    () => import('@fontsource/lexend/400.css'),
    () => import('@fontsource/lexend/500.css'),
    () => import('@fontsource/lexend/700.css')
  ],
  'work-sans': [
    () => import('@fontsource/work-sans/400.css'),
    () => import('@fontsource/work-sans/500.css'),
    () => import('@fontsource/work-sans/700.css')
  ],
  inter: [
    () => import('@fontsource/inter/400.css'),
    () => import('@fontsource/inter/500.css'),
    () => import('@fontsource/inter/700.css')
  ],
  poppins: [
    () => import('@fontsource/poppins/400.css'),
    () => import('@fontsource/poppins/500.css'),
    () => import('@fontsource/poppins/700.css')
  ],
  'ibm-plex-sans': [
    () => import('@fontsource/ibm-plex-sans/400.css'),
    () => import('@fontsource/ibm-plex-sans/500.css'),
    () => import('@fontsource/ibm-plex-sans/700.css')
  ],
  'source-sans': [
    () => import('@fontsource/source-sans-3/400.css'),
    () => import('@fontsource/source-sans-3/500.css'),
    () => import('@fontsource/source-sans-3/700.css')
  ],
  'nunito-sans': [
    () => import('@fontsource/nunito-sans/400.css'),
    () => import('@fontsource/nunito-sans/500.css'),
    () => import('@fontsource/nunito-sans/700.css')
  ],
  roboto: [
    () => import('@fontsource/roboto/400.css'),
    () => import('@fontsource/roboto/500.css'),
    () => import('@fontsource/roboto/700.css')
  ],
  'open-sans': [
    () => import('@fontsource/open-sans/400.css'),
    () => import('@fontsource/open-sans/500.css'),
    () => import('@fontsource/open-sans/700.css')
  ],
  lato: [
    () => import('@fontsource/lato/400.css'),
    () => import('@fontsource/lato/700.css')
  ],
  atkinson: [
    () => import('@fontsource/atkinson-hyperlegible/400.css'),
    () => import('@fontsource/atkinson-hyperlegible/700.css')
  ],
  'space-mono': [
    () => import('@fontsource/space-mono/400.css'),
    () => import('@fontsource/space-mono/700.css')
  ],
  'jetbrains-mono': [
    () => import('@fontsource/jetbrains-mono/400.css'),
    () => import('@fontsource/jetbrains-mono/500.css'),
    () => import('@fontsource/jetbrains-mono/700.css')
  ],
  'fira-code': [
    () => import('@fontsource/fira-code/400.css'),
    () => import('@fontsource/fira-code/500.css'),
    () => import('@fontsource/fira-code/700.css')
  ],
  'ibm-plex-mono': [
    () => import('@fontsource/ibm-plex-mono/400.css'),
    () => import('@fontsource/ibm-plex-mono/500.css'),
    () => import('@fontsource/ibm-plex-mono/700.css')
  ],
  'source-code-pro': [
    () => import('@fontsource/source-code-pro/400.css'),
    () => import('@fontsource/source-code-pro/500.css'),
    () => import('@fontsource/source-code-pro/700.css')
  ],
  'roboto-mono': [
    () => import('@fontsource/roboto-mono/400.css'),
    () => import('@fontsource/roboto-mono/500.css'),
    () => import('@fontsource/roboto-mono/700.css')
  ],
  inconsolata: [
    () => import('@fontsource/inconsolata/400.css'),
    () => import('@fontsource/inconsolata/500.css'),
    () => import('@fontsource/inconsolata/700.css')
  ],
  'ubuntu-mono': [
    () => import('@fontsource/ubuntu-mono/400.css'),
    () => import('@fontsource/ubuntu-mono/700.css')
  ]
} satisfies Record<string, FontLoader[]>

type FontKey = keyof typeof FONT_LOADERS

const BODY_FONT_KEYS: Record<BodyFontId, FontKey | null> = {
  'system-ui': null,
  inter: 'inter',
  'dm-sans': 'dm-sans',
  'ibm-plex-sans': 'ibm-plex-sans',
  'source-sans': 'source-sans',
  'nunito-sans': 'nunito-sans',
  roboto: 'roboto',
  'open-sans': 'open-sans',
  lato: 'lato',
  atkinson: 'atkinson'
}

const TERMINAL_FONT_KEYS: Record<TerminalFontId, FontKey | null> = {
  'space-mono': 'space-mono',
  'jetbrains-mono': 'jetbrains-mono',
  'fira-code': 'fira-code',
  'ibm-plex-mono': 'ibm-plex-mono',
  'source-code-pro': 'source-code-pro',
  'roboto-mono': 'roboto-mono',
  inconsolata: 'inconsolata',
  'ubuntu-mono': 'ubuntu-mono',
  courier: null,
  menlo: null
}

const loaded = new Set<FontKey>()
const loading = new Map<FontKey, Promise<void>>()

function loadFont(key: FontKey | null): Promise<void> {
  if (!key || loaded.has(key)) return Promise.resolve()
  const existing = loading.get(key)
  if (existing) return existing

  const promise = Promise.all(FONT_LOADERS[key].map((loader) => loader())).then(() => {
    loaded.add(key)
    loading.delete(key)
  })
  loading.set(key, promise)
  return promise
}

export function ensureDefaultFonts(): Promise<void> {
  return ensureFontsForSettings(DEFAULT_SETTINGS)
}

export function ensureFontsForSettings(settings: Pick<
  Settings,
  'uiHeadingFontFamily' | 'uiBodyFontFamily' | 'terminalFontFamily' | 'gitDiffFontFamily'
>): Promise<void> {
  return Promise.all([
    loadFont(settings.uiHeadingFontFamily),
    loadFont(BODY_FONT_KEYS[settings.uiBodyFontFamily]),
    loadFont(TERMINAL_FONT_KEYS[settings.terminalFontFamily]),
    // Diff font follows the terminal font when unset; load whichever applies.
    loadFont(TERMINAL_FONT_KEYS[settings.gitDiffFontFamily ?? settings.terminalFontFamily])
  ]).then(() => undefined)
}
