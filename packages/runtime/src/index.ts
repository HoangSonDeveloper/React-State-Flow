/**
 * @rsf/runtime
 *
 * Import này TRƯỚC khi React mount để hook vào React DevTools global hook.
 * Sends render events via WebSocket to the RSF CLI server.
 *
 * Usage:
 *   import '@rsf/runtime'   // top of main.tsx / index.tsx
 */

export interface RenderEvent {
  type: 'render'
  componentName: string
  renderCount: number
  timestamp: number
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any
    __RSF_WS__: WebSocket | null
  }
}

const RSF_PORT = (window as any).__RSF_PORT__ ?? 7272
const WS_URL = `ws://localhost:${RSF_PORT}/runtime`

// Render counter per component
const renderCounts = new Map<string, number>()

function send(event: RenderEvent) {
  if (!window.__RSF_WS__ || window.__RSF_WS__.readyState !== WebSocket.OPEN) return
  window.__RSF_WS__.send(JSON.stringify(event))
}

function connect() {
  const ws = new WebSocket(WS_URL)
  window.__RSF_WS__ = ws

  ws.addEventListener('open', () => {
    console.debug('[RSF] Runtime connected')
  })

  ws.addEventListener('close', () => {
    console.debug('[RSF] Runtime disconnected, retrying in 2s...')
    setTimeout(connect, 2000)
  })

  ws.addEventListener('error', () => {
    // suppress — will retry on close
  })
}

function hookIntoReact() {
  // React checks for this global hook on load and calls it during reconciliation
  const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? {}

  const originalOnCommitFiberRoot =
    existing.onCommitFiberRoot?.bind(existing) ?? (() => {})

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    ...existing,
    isDisabled: false,
    supportsFiber: true,

    onCommitFiberRoot(rendererID: number, root: any, priorityLevel: any) {
      // Call through so React DevTools still works
      originalOnCommitFiberRoot(rendererID, root, priorityLevel)

      // Walk the fiber tree from root
      try {
        walkFiber(root.current)
      } catch {
        // Never break the app
      }
    },
  }
}

function getFiberName(fiber: any): string | null {
  const type = fiber?.type
  if (!type) return null
  if (typeof type === 'string') return null // DOM element
  if (typeof type === 'function') return type.displayName ?? type.name ?? null
  if (typeof type === 'object' && type !== null) {
    // forwardRef, memo, etc.
    return (
      type.displayName ??
      type.render?.displayName ??
      type.render?.name ??
      null
    )
  }
  return null
}

function walkFiber(fiber: any) {
  if (!fiber) return

  const name = getFiberName(fiber)
  if (name && /^[A-Z]/.test(name)) {
    const count = (renderCounts.get(name) ?? 0) + 1
    renderCounts.set(name, count)
    send({ type: 'render', componentName: name, renderCount: count, timestamp: Date.now() })
  }

  walkFiber(fiber.child)
  walkFiber(fiber.sibling)
}

// Bootstrap
if (typeof window !== 'undefined') {
  hookIntoReact()
  connect()
}
