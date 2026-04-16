import { build } from 'esbuild'
import { cpSync } from 'fs'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/index.js',
  external: ['fsevents'],
  banner: { js: '#!/usr/bin/env node' },
})

cpSync('ui/dist', 'dist/ui', { recursive: true })

console.log('Build complete: dist/index.js + dist/ui/')
