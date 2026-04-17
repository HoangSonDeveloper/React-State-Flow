import { useEffect, useRef, useCallback } from 'react'
import type { RenderEvent, RuntimeState, GraphData } from './types.js'
import { buildRuntimeHistorySnapshot } from '../../src/runtime/history.js'

const FLASH_DURATION = 800 // ms

// D6: Use RSF_PORT from window config instead of hardcoded value
const RSF_PORT = (window as any).__RSF_PORT__ ?? 7272

export interface RuntimeBridgeApi {
  /** Request a global counter reset; server broadcasts to all clients. */
  reset(): void
}

export function useRuntimeBridge(
  onUpdate: (state: RuntimeState) => void,
  onGraphUpdate?: (graph: GraphData) => void,
  options: { paused?: boolean } = {},
): RuntimeBridgeApi {
  const stateRef = useRef<RuntimeState>({
    renderCounts: {},
    recentlyRendered: new Set(),
    wastedCounts: {},
    recentlyWasted: new Set(),
  })
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)
  // Read paused via ref so flag changes don't tear down the WebSocket.
  const pausedRef = useRef(options.paused ?? false)
  pausedRef.current = options.paused ?? false

  const handleEvent = useCallback(
    (event: RenderEvent) => {
      if (!event.componentId) return
      const s = stateRef.current

      // Update render count
      s.renderCounts[event.componentId] = event.renderCount

      // Track wasted renders
      if (event.isWasted) {
        s.wastedCounts[event.componentId] = (s.wastedCounts[event.componentId] ?? 0) + 1
        s.recentlyWasted.add(event.componentId)
      } else {
        s.recentlyWasted.delete(event.componentId)
      }

      // Mark as recently rendered
      s.recentlyRendered.add(event.componentId)

      // Clear flash after FLASH_DURATION
      const existing = timersRef.current.get(event.componentId)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        stateRef.current.recentlyRendered.delete(event.componentId!)
        stateRef.current.recentlyWasted.delete(event.componentId!)
        onUpdate({
          ...stateRef.current,
          recentlyRendered: new Set(stateRef.current.recentlyRendered),
          recentlyWasted: new Set(stateRef.current.recentlyWasted),
        })
      }, FLASH_DURATION)
      timersRef.current.set(event.componentId, timer)

      onUpdate({
        ...s,
        recentlyRendered: new Set(s.recentlyRendered),
        recentlyWasted: new Set(s.recentlyWasted),
      })
    },
    [onUpdate],
  )

  useEffect(() => {
    let destroyed = false
    let reconnectDelay = 2000  // B3 (UI side): exponential backoff

    function connect() {
      if (destroyed) return
      const ws = new WebSocket(`ws://${window.location.hostname}:${RSF_PORT}/runtime-ui`)
      wsRef.current = ws

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'render') {
            // M2.3: skip live render events when paused (counts/flash freeze)
            if (pausedRef.current) return
            handleEvent(msg as RenderEvent)
          } else if (msg.type === 'graph-update' && onGraphUpdate) {
            // D2: CLI pushed a new graph due to file change
            onGraphUpdate(msg.graph as GraphData)
          } else if (msg.type === 'history' && Array.isArray(msg.events)) {
            const snapshot = buildRuntimeHistorySnapshot(msg.events as RenderEvent[])
            stateRef.current = {
              renderCounts: snapshot.renderCounts,
              recentlyRendered: new Set(),
              wastedCounts: snapshot.wastedCounts,
              recentlyWasted: new Set(),
            }
            onUpdate({ ...stateRef.current, recentlyRendered: new Set(), recentlyWasted: new Set() })
          } else if (msg.type === 'reset') {
            // M2.3: server confirmed reset — clear local state + flash timers
            timersRef.current.forEach(clearTimeout)
            timersRef.current.clear()
            stateRef.current = {
              renderCounts: {},
              recentlyRendered: new Set(),
              wastedCounts: {},
              recentlyWasted: new Set(),
            }
            onUpdate({
              renderCounts: {},
              recentlyRendered: new Set(),
              wastedCounts: {},
              recentlyWasted: new Set(),
            })
          }
        } catch {}
      })

      ws.addEventListener('open', () => {
        reconnectDelay = 2000  // reset on success
      })

      ws.addEventListener('close', () => {
        wsRef.current = null
        if (!destroyed) {
          setTimeout(connect, reconnectDelay)
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
        }
      })
    }

    connect()

    return () => {
      destroyed = true
      wsRef.current?.close()
      timersRef.current.forEach(clearTimeout)
    }
  }, [handleEvent, onUpdate, onGraphUpdate])

  const reset = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'reset' }))
    }
  }, [])

  return { reset }
}
