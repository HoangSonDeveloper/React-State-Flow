import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7273,
    proxy: {
      '/api': 'http://localhost:7272',
      '/ws': { target: 'ws://localhost:7272', ws: true },
    },
  },
})
