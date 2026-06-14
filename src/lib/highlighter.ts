import type { HighlighterCore, LanguageRegistration, ThemeRegistration } from 'shiki/core'
import {
  TERMINAL_THEME_ORDER,
  terminalThemePalette,
  terminalThemeIsDark,
  type TerminalThemeId
} from '@shared/terminalThemes'

// --- Types -------------------------------------------------------------------

/**
 * ------------------------------------------------
 * A single highlighted token with optional hex colour.
 */
export interface HighlightToken {
  content: string
  color?: string
}

// --- Module-level singleton state --------------------------------------------

let _highlighter: HighlighterCore | null = null
let _initPromise: Promise<HighlighterCore> | null = null
let _ready = false

// --- Terminal palette → Shiki theme -----------------------------------------
// The diff viewer follows the active session-terminal theme: each terminal
// palette (16 ANSI colours + bg/fg) becomes a TextMate theme so syntax colours
// match the terminal. Only the palette colours matter here — the terminal's
// background image/opacity are irrelevant to highlighting.

/** Shiki theme name registered for a terminal theme id. */
function shikiThemeName(id: TerminalThemeId): string {
  return `gc-term-${id}`
}

/** Map a terminal palette onto TextMate scopes (base16-style ANSI mapping). */
function buildTerminalTheme(id: TerminalThemeId): ThemeRegistration {
  const p = terminalThemePalette(id)
  return {
    name: shikiThemeName(id),
    type: terminalThemeIsDark(id) ? 'dark' : 'light',
    colors: {
      'editor.background': p.background,
      'editor.foreground': p.foreground
    },
    tokenColors: [
      { scope: ['comment', 'punctuation.definition.comment', 'string.comment'], settings: { foreground: p.brightBlack, fontStyle: 'italic' } },
      { scope: ['string', 'string.quoted', 'string.template'], settings: { foreground: p.green } },
      { scope: ['constant.character.escape', 'string.regexp', 'constant.other.placeholder'], settings: { foreground: p.cyan } },
      { scope: ['constant.numeric', 'constant.language', 'constant.language.boolean', 'keyword.other.unit'], settings: { foreground: p.yellow } },
      { scope: ['constant', 'entity.name.constant', 'variable.other.constant'], settings: { foreground: p.yellow } },
      { scope: ['keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier'], settings: { foreground: p.magenta } },
      { scope: ['keyword.operator'], settings: { foreground: p.cyan } },
      { scope: ['entity.name.function', 'support.function', 'meta.function-call', 'variable.function'], settings: { foreground: p.blue } },
      { scope: ['entity.name.type', 'entity.name.class', 'entity.other.inherited-class', 'support.type', 'support.class', 'entity.name.namespace'], settings: { foreground: p.yellow } },
      { scope: ['variable.language', 'support.variable'], settings: { foreground: p.red } },
      { scope: ['variable', 'variable.other', 'variable.parameter', 'meta.definition.variable'], settings: { foreground: p.foreground } },
      { scope: ['entity.name.tag', 'punctuation.definition.tag'], settings: { foreground: p.red } },
      { scope: ['entity.other.attribute-name'], settings: { foreground: p.yellow } },
      { scope: ['support.type.property-name', 'meta.object-literal.key'], settings: { foreground: p.blue } },
      { scope: ['markup.inserted'], settings: { foreground: p.green } },
      { scope: ['markup.deleted'], settings: { foreground: p.red } },
      { scope: ['markup.heading', 'entity.name.section'], settings: { foreground: p.blue, fontStyle: 'bold' } },
      { scope: ['punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator'], settings: { foreground: p.foreground } }
    ]
  }
}

const TERMINAL_THEMES: ThemeRegistration[] = TERMINAL_THEME_ORDER.map(buildTerminalTheme)

// --- Extension → language map -----------------------------------------------

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  yaml: 'yaml',
  yml: 'yaml',
  rs: 'rust',
  py: 'python',
}

// --- Initialisation ----------------------------------------------------------

/**
 * ------------------------------------------------
 * Initialise the Shiki highlighter singleton. Safe to call multiple times —
 * returns a cached promise. Idempotent.
 * @returns {Promise<HighlighterCore>} Resolved highlighter instance.
 */
export function initHighlighter(): Promise<HighlighterCore> {
  if (_highlighter) return Promise.resolve(_highlighter)
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const [
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      langTypescript,
      langTsx,
      langJavascript,
      langJsx,
      langJson,
      langCss,
      langHtml,
      langMarkdown,
      langShellscript,
      langYaml,
      langRust,
      langPython
    ] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/tsx'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/jsx'),
      import('@shikijs/langs/json'),
      import('@shikijs/langs/css'),
      import('@shikijs/langs/html'),
      import('@shikijs/langs/markdown'),
      import('@shikijs/langs/shellscript'),
      import('@shikijs/langs/yaml'),
      import('@shikijs/langs/rust'),
      import('@shikijs/langs/python')
    ])
    const engine = await createJavaScriptRegexEngine()
    const langs: LanguageRegistration[] = [
      ...langTypescript.default,
      ...langTsx.default,
      ...langJavascript.default,
      ...langJsx.default,
      ...langJson.default,
      ...langCss.default,
      ...langHtml.default,
      ...langMarkdown.default,
      ...langShellscript.default,
      ...langYaml.default,
      ...langRust.default,
      ...langPython.default
    ]
    const hl = await createHighlighterCore({
      engine,
      themes: TERMINAL_THEMES,
      langs
    })
    _highlighter = hl
    _ready = true
    return hl
  })().catch((error) => {
    _highlighter = null
    _initPromise = null
    _ready = false
    throw error
  })

  return _initPromise
}

/**
 * ------------------------------------------------
 * Whether the highlighter has finished initialising. If `false`, callers
 * should render plain text and upgrade once `true`.
 * @returns {boolean} Readiness flag.
 */
export function isReady(): boolean {
  return _ready
}

/**
 * ------------------------------------------------
 * Look up the Shiki language id for a file path by its extension. Returns
 * `null` for unknown / unsupported extensions.
 * @param {string} path - File path.
 * @returns {string | null} Language id or null.
 */
export function langForFile(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot === -1 || dot === path.length - 1) return null
  const ext = path.slice(dot + 1).toLowerCase()
  return EXT_LANG[ext] ?? null
}

/**
 * ------------------------------------------------
 * Tokenise a single line of text using the loaded Shiki highlighter. Returns
 * `null` when the highlighter is not initialised yet, the theme is unknown, or
 * tokenisation fails — callers fall back to plain text.
 * @param {string} langId - Shiki language id (e.g. `'typescript'`).
 * @param {string} text - Single line of code (without the diff +/- prefix).
 * @param {TerminalThemeId} terminalThemeId - Active terminal theme to colour by.
 * @returns {HighlightToken[] | null} Array of tokens with colour, or null.
 */
export function tokenizeLine(
  langId: string,
  text: string,
  terminalThemeId: TerminalThemeId
): HighlightToken[] | null {
  const hl = _highlighter
  if (!hl) return null

  try {
    const result = hl.codeToTokensBase(text, {
      lang: langId,
      theme: shikiThemeName(terminalThemeId)
    })
    // result[0] is tokens for the single line we passed; empty → plain text.
    if (!result[0] || result[0].length === 0) {
      return [{ content: text }]
    }
    return result[0].map((t) => ({
      content: t.content,
      color: t.color
    }))
  } catch {
    return null
  }
}
