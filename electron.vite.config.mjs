import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Main and preload are bundled (no externals) so the portable exe doesn't depend on node_modules layout
// and the ESM-only @octokit/rest works from the CJS main bundle.
export default defineConfig({
  main: { build: { externalizeDeps: false } },
  preload: { build: { externalizeDeps: false } },
  renderer: { plugins: [react()] }
})
