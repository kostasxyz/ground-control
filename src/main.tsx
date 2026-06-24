import './bridge'
import { createRoot } from 'react-dom/client'
import { appThemeScheme } from '@shared/appThemes'
import App from './App'
import { ensureDefaultFonts } from './lib/fontLoader'

import '@xterm/xterm/css/xterm.css'
// Icon-only Nerd Font face (symbols); appended to every terminal stack in
// shared/fonts.ts so agent-CLI glyphs render instead of xterm's missing-glyph "?".
import '@azurity/pure-nerd-font/pure-nerd-font.css'
import './styles/tokens.css'
import './styles/global.css'

// Seed the persisted theme onto <html> before the first paint so the loading
// frame shows the selected theme, not the default surface. applyAppearance()
// re-applies the full set (fonts, terminal) once bootstrap resolves.
const startupTheme = window.gc.system.startupAppTheme
if (startupTheme) {
  const root = document.documentElement
  const scheme = appThemeScheme(startupTheme)
  root.dataset.theme = scheme
  root.dataset.appTheme = startupTheme
  root.style.colorScheme = scheme
}

void ensureDefaultFonts()

// No StrictMode: its dev double-mount would spawn→kill→spawn each PTY.
createRoot(document.getElementById('root')!).render(<App />)
