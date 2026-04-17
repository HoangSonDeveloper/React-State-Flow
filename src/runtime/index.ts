/**
 * react-state-flow/runtime
 *
 * Import this before React mounts to hook into the React DevTools global hook.
 * The module is a safe no-op during SSR / Node imports.
 */

import { getRegisteredComponentId } from './registry.js'
import { collectCommitRenderEvents } from './collect-events.js'
import { isWastedRender } from './wasted.js'

export interface RenderEvent {
  type: 'render'
  componentName: string
  componentId?: string
  renderCount: number
  timestamp: number
  isWasted?: boolean
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any
    __RSF_PORT__?: number
    __RSF_WS__: WebSocket | null
  }
}

const MAX_RENDER_COUNT_ENTRIES = 500
const renderCounts = new Map<string, number>()
let reconnectDelay = 2000

function incrementRenderCount(identity: string): number {
  if (!renderCounts.has(identity) && renderCounts.size >= MAX_RENDER_COUNT_ENTRIES) {
    const firstKey = renderCounts.keys().next().value
    if (firstKey !== undefined) renderCounts.delete(firstKey)
  }

  const count = (renderCounts.get(identity) ?? 0) + 1
  renderCounts.set(identity, count)
  return count
}

function getBrowserWindow(): Window | undefined {
  if (typeof window === 'undefined') return undefined
  return window
}

function getWsUrl(win: Window): string {
  const port = win.__RSF_PORT__ ?? 7272
  return `ws://localhost:${port}/runtime`
}

function send(win: Window, event: RenderEvent) {
  if (!win.__RSF_WS__ || win.__RSF_WS__.readyState !== WebSocket.OPEN) return
  win.__RSF_WS__.send(JSON.stringify(event))
}

function connect(win: Window) {
  const ws = new WebSocket(getWsUrl(win))
  win.__RSF_WS__ = ws

  ws.addEventListener('open', () => {
    reconnectDelay = 2000
    renderCounts.clear()
    console.debug('[RSF] Runtime connected')
  })

  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data)
      if (message?.type === 'reset') renderCounts.clear()
    } catch {
      // Ignore malformed control messages.
    }
  })

  ws.addEventListener('close', () => {
    console.debug(`[RSF] Runtime disconnected, retrying in ${reconnectDelay / 1000}s...`)
    setTimeout(() => connect(win), reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
  })

  ws.addEventListener('error', () => {
    // Suppress and retry on close.
  })
}

function hookIntoReact(win: Window) {
  const existing = win.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? {}
  const originalOnCommitFiberRoot = existing.onCommitFiberRoot?.bind(existing) ?? (() => {})

  const overrides = {
    isDisabled: false,
    supportsFiber: true,
    onCommitFiberRoot(rendererID: number, root: any, priorityLevel: any) {
      originalOnCommitFiberRoot(rendererID, root, priorityLevel)

      try {
        const events = collectCommitRenderEvents({
          rootFiber: root.current,
          getFiberName,
          getFiberComponentId,
          incrementRenderCount,
          isWastedRender,
          now: () => Date.now(),
        })
        for (const event of events) send(win, event)
      } catch {
        // Never break the app.
      }
    },
  }

  try {
    // Normal case: no DevTools extension, property is writable.
    win.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { ...existing, ...overrides }
  } catch {
    // React DevTools extension defines the property as getter-only via Object.defineProperty.
    // Mutate the existing hook object in place instead.
    Object.assign(existing, overrides)
  }
}

function getFiberName(fiber: any): string | null {
  const type = fiber?.type
  if (!type) return null
  if (typeof type === 'string') return null
  if (typeof type === 'function') return type.displayName ?? type.name ?? null
  if (typeof type === 'object' && type !== null) {
    return (
      type.displayName ??
      type.render?.displayName ??
      type.render?.name ??
      null
    )
  }
  return null
}

function getFiberComponentId(fiber: any): string | undefined {
  return getRegisteredComponentId(fiber?.type)
}

function isProductionMode(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    return true
  }

  const metaEnv = (import.meta as any)?.env
  return metaEnv?.MODE === 'production'
}

function bootstrap() {
  const win = getBrowserWindow()
  if (!win || isProductionMode()) return

  hookIntoReact(win)
  connect(win)
}

bootstrap()
