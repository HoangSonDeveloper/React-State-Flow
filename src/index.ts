#!/usr/bin/env node
import { createServer } from 'http'
import { existsSync, readFileSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { WebSocketServer } from 'ws'
import open from 'open'
import pc from 'picocolors'
import chokidar from 'chokidar'
import { parseProject } from './parser/index.js'
import type { GraphData } from './parser/index.js'
import { parseArgs } from './cli-args.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const UI_DIST = resolve(__dirname, '../ui/dist')
const UI_DEV_PORT = 7273

// C2: Render event history ring buffer — replayed to new UI connections
interface StoredRenderEvent {
  type: 'render'
  componentName: string
  renderCount: number
  timestamp: number
}

const MAX_HISTORY = 1000
const renderHistory: StoredRenderEvent[] = []

function appendHistory(event: StoredRenderEvent) {
  renderHistory.push(event)
  if (renderHistory.length > MAX_HISTORY) renderHistory.shift()
}

/** Supported editor URL schemes for click-to-open. */
const EDITOR_SCHEMES: Record<string, string> = {
  vscode:    'vscode://file/{path}:{line}',
  cursor:    'cursor://file/{path}:{line}',
  webstorm:  'webstorm://open?file={path}&line={line}',
  zed:       'zed://file/{path}:{line}',
}

async function main() {
  const { targetPath, editor, port, open: shouldOpen, ignore } = parseArgs(process.argv.slice(2))
  const targetDir = resolve(targetPath)
  const editorScheme = EDITOR_SCHEMES[editor] ?? EDITOR_SCHEMES.vscode
  // Sanitize for injection into <script> tag (alphanumeric + colon/slash/braces only)
  const safeEditorScheme = editorScheme.replace(/[^a-zA-Z0-9:/{}._\-=&?]/g, '')

  if (!existsSync(targetDir)) {
    console.error(pc.red(`Directory not found: ${targetDir}`))
    process.exit(1)
  }

  console.log(pc.cyan('\n  React State Flow\n'))
  console.log(`  ${pc.dim('Scanning')} ${pc.white(targetDir)}`)

  // C3: Wrap initial parse in try-catch so server still starts on parse errors
  let graph: GraphData = { projectRoot: targetDir, nodes: [], edges: [] }
  try {
    graph = parseProject(targetDir, { ignore })
    console.log(
      `  ${pc.green('✓')} Found ${pc.white(graph.nodes.length)} nodes, ${pc.white(graph.edges.length)} edges`,
    )
  } catch (err) {
    console.error(pc.red(`  [RSF] Initial parse failed: ${(err as Error).message}`))
    console.warn(pc.yellow('  Serving empty graph. Fix errors and save to trigger reload.'))
  }

  // --- HTTP + WS server ---
  const app = express()
  const uiClients = new Set<any>()

  // Serve graph data
  app.get('/api/graph', (_req, res) => {
    res.json(graph)
  })

  // C4: Validate port as integer before embedding in HTML to prevent XSS
  const safeDevPort = parseInt(String(UI_DEV_PORT), 10)

  // Config script injected into every HTML response
  const configScript = `<script>window.__RSF_EDITOR_SCHEME__=${JSON.stringify(safeEditorScheme)}</script>`

  // Serve UI static files if built, else proxy hint
  if (existsSync(UI_DIST)) {
    app.use(express.static(UI_DIST))
    app.get('*', (_req, res) => {
      // Inject config before </head>
      const indexPath = join(UI_DIST, 'index.html')
      const html = readFileSync(indexPath, 'utf-8').replace('</head>', `${configScript}</head>`)
      res.type('html').send(html)
    })
  } else {
    app.get('/', (_req, res) => {
      res.send(`
        <html><head>${configScript}</head><body style="font-family:monospace;background:#0f1117;color:#e2e8f0;padding:32px">
          <p>UI not built yet. Run:</p>
          <pre style="color:#22c55e">npm run build:ui</pre>
          <p>Then open <a style="color:#818cf8" href="http://localhost:${safeDevPort}">http://localhost:${safeDevPort}</a></p>
        </body></html>
      `)
    })
  }

  const httpServer = createServer(app)

  // --- WebSocket server ---
  // Two paths:
  //   /runtime     ← receives events from react-state-flow/runtime (user's app)
  //   /runtime-ui  ← pushes events to the UI browser
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws, req) => {
    const path = req.url ?? ''

    if (path === '/runtime-ui') {
      // UI browser connecting
      uiClients.add(ws)
      // C2: Replay render history so refreshed UI can reconstruct render counts
      if (renderHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'history', events: renderHistory }))
      }
      ws.on('close', () => uiClients.delete(ws))
      return
    }

    if (path === '/runtime') {
      // User app runtime connecting
      ws.on('message', (raw) => {
        const str = raw.toString()
        // C2: Store render events for history replay
        try {
          const evt = JSON.parse(str) as StoredRenderEvent
          if (evt.type === 'render') appendHistory(evt)
        } catch {}
        // Forward to all UI clients
        for (const client of uiClients) {
          if (client.readyState === 1) client.send(str)
        }
      })
      return
    }
  })

  httpServer.listen(port, () => {
    const url = `http://localhost:${port}`
    console.log(`  ${pc.green('✓')} Server running at ${pc.cyan(url)}`)
    console.log(`\n  ${pc.dim('Add runtime instrumentation to your app:')}`)
    console.log(`  ${pc.yellow("import 'react-state-flow/runtime'")}  ${pc.dim('// top of main.tsx')}\n`)

    if (shouldOpen) open(url).catch(() => {})
  })

  // C1: File watching — re-parse on source changes and push updated graph to UI
  const WATCH_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']
  let reparsTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleReparse() {
    if (reparsTimer) clearTimeout(reparsTimer)
    reparsTimer = setTimeout(() => {
      try {
        graph = parseProject(targetDir, { ignore })
        console.log(pc.cyan(`  [RSF] Graph updated: ${graph.nodes.length} nodes, ${graph.edges.length} edges`))
        const payload = JSON.stringify({ type: 'graph-update', graph })
        for (const client of uiClients) {
          if (client.readyState === 1) client.send(payload)
        }
      } catch (err) {
        console.error(pc.red(`  [RSF] Re-parse failed: ${(err as Error).message}`))
      }
    }, 300)
  }

  // Build chokidar ignore regex: built-in paths + user --ignore entries (escaped).
  const extraIgnorePattern = ignore
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const ignoreRegex = extraIgnorePattern
    ? new RegExp(`(node_modules|\\.git|dist|build|\\.next|${extraIgnorePattern})`)
    : /(node_modules|\.git|dist|build|\.next)/

  chokidar
    .watch(targetDir, {
      ignored: ignoreRegex,
      persistent: true,
      ignoreInitial: true,
    })
    .on('change', (p) => { if (WATCH_EXTENSIONS.some((ext) => p.endsWith(ext))) scheduleReparse() })
    .on('add',    (p) => { if (WATCH_EXTENSIONS.some((ext) => p.endsWith(ext))) scheduleReparse() })
    .on('unlink', (p) => { if (WATCH_EXTENSIONS.some((ext) => p.endsWith(ext))) scheduleReparse() })
}

main().catch((e) => {
  console.error(pc.red(e.message))
  process.exit(1)
})
