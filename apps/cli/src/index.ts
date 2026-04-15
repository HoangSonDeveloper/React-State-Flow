#!/usr/bin/env node
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { WebSocketServer } from 'ws'
import open from 'open'
import pc from 'picocolors'
import { parseProject } from '@rsf/parser'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = 7272
const UI_DIST = resolve(__dirname, '../../packages/ui/dist')
const UI_DEV_PORT = 7273

async function main() {
  const args = process.argv.slice(2)
  const targetDir = resolve(args[0] ?? '.')

  if (!existsSync(targetDir)) {
    console.error(pc.red(`Directory not found: ${targetDir}`))
    process.exit(1)
  }

  console.log(pc.cyan('\n  React State Flow\n'))
  console.log(`  ${pc.dim('Scanning')} ${pc.white(targetDir)}`)

  // --- Parse project ---
  const graph = parseProject(targetDir)
  console.log(
    `  ${pc.green('✓')} Found ${pc.white(graph.nodes.length)} nodes, ${pc.white(graph.edges.length)} edges`,
  )

  // --- HTTP + WS server ---
  const app = express()

  // Serve graph data
  app.get('/api/graph', (_req, res) => {
    res.json(graph)
  })

  // Serve UI static files if built, else proxy hint
  if (existsSync(UI_DIST)) {
    app.use(express.static(UI_DIST))
    app.get('*', (_req, res) => {
      res.sendFile(join(UI_DIST, 'index.html'))
    })
  } else {
    app.get('/', (_req, res) => {
      res.send(`
        <html><body style="font-family:monospace;background:#0f1117;color:#e2e8f0;padding:32px">
          <p>UI not built yet. Run:</p>
          <pre style="color:#22c55e">cd packages/ui && pnpm dev</pre>
          <p>Then open <a style="color:#818cf8" href="http://localhost:${UI_DEV_PORT}">http://localhost:${UI_DEV_PORT}</a></p>
        </body></html>
      `)
    })
  }

  const httpServer = createServer(app)

  // --- WebSocket server ---
  // Two paths:
  //   /runtime     ← receives events from @rsf/runtime (user's app)
  //   /runtime-ui  ← pushes events to the UI browser
  const wss = new WebSocketServer({ server: httpServer })

  const uiClients = new Set<any>()

  wss.on('connection', (ws, req) => {
    const path = req.url ?? ''

    if (path === '/runtime-ui') {
      // UI browser connecting
      uiClients.add(ws)
      ws.on('close', () => uiClients.delete(ws))
      return
    }

    if (path === '/runtime') {
      // User app runtime connecting
      ws.on('message', (raw) => {
        // Forward to all UI clients
        for (const client of uiClients) {
          if (client.readyState === 1) client.send(raw.toString())
        }
      })
      return
    }
  })

  httpServer.listen(PORT, () => {
    const url = `http://localhost:${PORT}`
    console.log(`  ${pc.green('✓')} Server running at ${pc.cyan(url)}`)
    console.log(`\n  ${pc.dim('Add runtime instrumentation to your app:')}`)
    console.log(`  ${pc.yellow("import '@rsf/runtime'")}  ${pc.dim('// top of main.tsx')}\n`)

    // Open browser
    open(url).catch(() => {})
  })
}

main().catch((e) => {
  console.error(pc.red(e.message))
  process.exit(1)
})
