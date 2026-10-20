/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base + HashRouter means the same build works from a GitHub Pages
  // sub-path (/Households/) and from the root of a Raspberry Pi web server.
  base: './',
  plugins: [react()],
  server: {
    port: 5070,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 5070,
    strictPort: true,
    host: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
