import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      'react-state-flow/runtime/history': resolve(__dirname, '../src/runtime/history.ts'),
    },
  },
  plugins: [react()],
  server: {
    port: 7273,
    proxy: {
      '/api': 'http://localhost:7272',
      '/ws': { target: 'ws://localhost:7272', ws: true },
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
