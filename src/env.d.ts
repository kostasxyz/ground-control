/// <reference types="vite/client" />
import type { GroundControlApi } from '@shared/types'

declare global {
  interface Window {
    gc: GroundControlApi
  }
}

export {}
