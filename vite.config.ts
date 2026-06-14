import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve(__dirname, 'shared')

// Tauri dev: fixed port, no screen clear. Renderer root is src/ (matches the
// Electron renderer's layout); build output goes to ../dist for tauri.conf.
export default defineConfig({
  root: resolve(__dirname, 'src'),
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      '@shared': shared,
      '@': resolve(__dirname, 'src')
    }
  },
  server: { port: 1420, strictPort: true },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'src/index.html') }
  }
})
