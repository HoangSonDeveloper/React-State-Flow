/**
 * react-state-flow/runtime
 *
 * Import này TRƯỚC khi React mount để hook vào React DevTools global hook.
 * Sends render events via WebSocket to the RSF CLI server.
 *
 * Usage:
 *   import 'react-state-flow/runtime'   // top of main.tsx / index.tsx
 */

export interface RenderEvent {
  type: 'render'
  componentName: string
  renderCount: number
  timestamp: number
  isWasted?: boolean  // true khi props/state không đổi nhưng vẫn re-render
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any
    __RSF_WS__: WebSocket | null
  }
}

const RSF_PORT = (window as any).__RSF_PORT__ ?? 7272
const WS_URL = `ws://localhost:${RSF_PORT}/runtime`

// B2: Render counter per component with max-size cap to prevent memory leak
const renderCounts = new Map<string, number>()
const MAX_RENDER_COUNT_ENTRIES = 500

function incrementRenderCount(name: string): number {
  if (!renderCounts.has(name) && renderCounts.size >= MAX_RENDER_COUNT_ENTRIES) {
    // Evict oldest entry (insertion order)
    const firstKey = renderCounts.keys().next().value
    if (firstKey !== undefined) renderCounts.delete(firstKey)
  }
  const count = (renderCounts.get(name) ?? 0) + 1
  renderCounts.set(name, count)
  return count
}

function send(event: RenderEvent) {
  if (!window.__RSF_WS__ || window.__RSF_WS__.readyState !== WebSocket.OPEN) return
  window.__RSF_WS__.send(JSON.stringify(event))
}

// B3: Exponential backoff reconnect
let reconnectDelay = 2000

function connect() {
  const ws = new WebSocket(WS_URL)
  window.__RSF_WS__ = ws

  ws.addEventListener('open', () => {
    reconnectDelay = 2000  // reset on successful connection
    renderCounts.clear()   // B2: sync counts with server on reconnect
    console.debug('[RSF] Runtime connected')
  })

  ws.addEventListener('close', () => {
    console.debug(`[RSF] Runtime disconnected, retrying in ${reconnectDelay / 1000}s...`)
    setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
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

      // B1: Pass per-commit Set to avoid counting sibling instances multiple times
      try {
        walkFiber(root.current, new Set<string>())
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

/** Shallow-equal two plain objects (props). Returns true if identical. */
function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/** Detect if a fiber's re-render was unnecessary (props+state unchanged). */
function isWastedRender(fiber: any): boolean {
  const prev = fiber.alternate
  if (!prev) return false  // first mount, not a wasted render
  const propsEqual = shallowEqual(fiber.memoizedProps, prev.memoizedProps)
  // For state: compare linked-list reference (function components use hook linked list)
  const stateEqual = fiber.memoizedState === prev.memoizedState
  return propsEqual && stateEqual
}

// B1: seenInCommit prevents counting sibling instances multiple times per commit
// Iterative walk to avoid stack overflow on deep trees (e.g. react-virtual)
function walkFiber(rootFiber: any, seenInCommit: Set<string>) {
  const stack: any[] = [rootFiber]
  while (stack.length > 0) {
    const fiber = stack.pop()
    if (!fiber) continue

    const name = getFiberName(fiber)
    if (name && /^[A-Z]/.test(name) && !seenInCommit.has(name)) {
      seenInCommit.add(name)
      const count = incrementRenderCount(name)
      const isWasted = isWastedRender(fiber)
      send({ type: 'render', componentName: name, renderCount: count, timestamp: Date.now(), isWasted })
    }

    if (fiber.sibling) stack.push(fiber.sibling)
    if (fiber.child) stack.push(fiber.child)
  }
}

// Bootstrap — only in development
const isDev =
  typeof process !== 'undefined'
    ? process.env.NODE_ENV !== 'production'
    : (import.meta as any).env?.MODE !== 'production'

if (typeof window !== 'undefined' && isDev) {
  hookIntoReact()
  connect()
}
