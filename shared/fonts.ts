export interface FontOption {
  id: string
  label: string
  stack: string
}

export const UI_HEADING_FONTS = {
  unbounded: { id: 'unbounded', label: 'Unbounded', stack: "'Unbounded', sans-serif" },
  outfit: { id: 'outfit', label: 'Outfit', stack: "'Outfit', sans-serif" },
  'dm-sans': { id: 'dm-sans', label: 'DM Sans', stack: "'DM Sans', sans-serif" },
  'plus-jakarta': {
    id: 'plus-jakarta',
    label: 'Plus Jakarta Sans',
    stack: "'Plus Jakarta Sans', sans-serif"
  },
  sora: { id: 'sora', label: 'Sora', stack: "'Sora', sans-serif" },
  manrope: { id: 'manrope', label: 'Manrope', stack: "'Manrope', sans-serif" },
  lexend: { id: 'lexend', label: 'Lexend', stack: "'Lexend', sans-serif" },
  'work-sans': { id: 'work-sans', label: 'Work Sans', stack: "'Work Sans', sans-serif" },
  inter: { id: 'inter', label: 'Inter', stack: "'Inter', sans-serif" },
  poppins: { id: 'poppins', label: 'Poppins', stack: "'Poppins', sans-serif" }
} as const satisfies Record<string, FontOption>

export const UI_BODY_FONTS = {
  'system-ui': {
    id: 'system-ui',
    label: 'System UI',
    stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
  },
  inter: { id: 'inter', label: 'Inter', stack: "'Inter', sans-serif" },
  'dm-sans': { id: 'dm-sans', label: 'DM Sans', stack: "'DM Sans', sans-serif" },
  'ibm-plex-sans': {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    stack: "'IBM Plex Sans', sans-serif"
  },
  'source-sans': {
    id: 'source-sans',
    label: 'Source Sans 3',
    stack: "'Source Sans 3', sans-serif"
  },
  'nunito-sans': {
    id: 'nunito-sans',
    label: 'Nunito Sans',
    stack: "'Nunito Sans', sans-serif"
  },
  roboto: { id: 'roboto', label: 'Roboto', stack: "'Roboto', sans-serif" },
  'open-sans': { id: 'open-sans', label: 'Open Sans', stack: "'Open Sans', sans-serif" },
  lato: { id: 'lato', label: 'Lato', stack: "'Lato', sans-serif" },
  atkinson: {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    stack: "'Atkinson Hyperlegible', sans-serif"
  }
} as const satisfies Record<string, FontOption>

export const TERMINAL_FONTS = {
  'space-mono': {
    id: 'space-mono',
    label: 'Space Mono',
    stack: "'Space Mono', ui-monospace, Menlo, monospace"
  },
  'jetbrains-mono': {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    stack: "'JetBrains Mono', ui-monospace, Menlo, monospace"
  },
  'fira-code': {
    id: 'fira-code',
    label: 'Fira Code',
    stack: "'Fira Code', ui-monospace, Menlo, monospace"
  },
  'ibm-plex-mono': {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    stack: "'IBM Plex Mono', ui-monospace, Menlo, monospace"
  },
  'source-code-pro': {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    stack: "'Source Code Pro', ui-monospace, Menlo, monospace"
  },
  'roboto-mono': {
    id: 'roboto-mono',
    label: 'Roboto Mono',
    stack: "'Roboto Mono', ui-monospace, Menlo, monospace"
  },
  inconsolata: {
    id: 'inconsolata',
    label: 'Inconsolata',
    stack: "'Inconsolata', ui-monospace, Menlo, monospace"
  },
  'ubuntu-mono': {
    id: 'ubuntu-mono',
    label: 'Ubuntu Mono',
    stack: "'Ubuntu Mono', ui-monospace, Menlo, monospace"
  },
  courier: {
    id: 'courier',
    label: 'Courier New',
    stack: "'Courier New', Courier, monospace"
  },
  menlo: {
    id: 'menlo',
    label: 'Menlo',
    stack: "Menlo, Monaco, 'Courier New', monospace"
  }
} as const satisfies Record<string, FontOption>

export type HeadingFontId = keyof typeof UI_HEADING_FONTS
export type BodyFontId = keyof typeof UI_BODY_FONTS
export type TerminalFontId = keyof typeof TERMINAL_FONTS

export const FONT_SIZE_BOUNDS = {
  uiHeading: { min: 12, max: 32 },
  uiBody: { min: 10, max: 24 },
  terminal: { min: 9, max: 24 }
} as const

export function resolveHeadingStack(id: HeadingFontId): string {
  return UI_HEADING_FONTS[id].stack
}

export function resolveBodyStack(id: BodyFontId): string {
  return UI_BODY_FONTS[id].stack
}

export function resolveTerminalStack(id: TerminalFontId): string {
  return TERMINAL_FONTS[id].stack
}
