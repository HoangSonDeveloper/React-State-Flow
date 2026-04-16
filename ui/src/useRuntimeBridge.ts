import { useEffect, useRef, useCallback } from 'react'
import type { RenderEvent, RuntimeState, GraphData } from './types.js'

const FLASH_DURATION = 800 // ms

// D6: Use RSF_PORT from window config instead of hardcoded value
const RSF_PORT = (window as any).__RSF_PORT__ ?? 7272

export function useRuntimeBridge(
  onUpdate: (state: RuntimeState) => void,
  onGraphUpdate?: (graph: GraphData) => void,  // D2: callback for file-watch graph updates
) {
  const stateRef = useRef<RuntimeState>({
    renderCounts: {},
    recentlyRendered: new Set(),
  })
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handleEvent = useCallback(
    (event: RenderEvent) => {
      const s = stateRef.current

      // Update render count
      s.renderCounts[event.componentName] = event.renderCount

      // Mark as recently rendered
      s.recentlyRendered.add(event.componentName)

      // Clear flash after FLASH_DURATION
      const existing = timersRef.current.get(event.componentName)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        stateRef.current.recentlyRendered.delete(event.componentName)
        onUpdate({ ...stateRef.current, recentlyRendered: new Set(stateRef.current.recentlyRendered) })
      }, FLASH_DURATION)
      timersRef.current.set(event.componentName, timer)

      onUpdate({ ...s, recentlyRendered: new Set(s.recentlyRendered) })
    },
    [onUpdate],
  )

  // D3: Replay historical events without triggering flash highlights
  const handleHistoricalEvent = useCallback(
    (event: RenderEvent) => {
      stateRef.current.renderCounts[event.componentName] = event.renderCount
      // deliberately skip recentlyRendered to avoid mass-flashing on reconnect
    },
    [],
  )

  useEffect(() => {
    let ws: WebSocket | null = null
    let destroyed = false
    let reconnectDelay = 2000  // B3 (UI side): exponential backoff

    function connect() {
      if (destroyed) return
      ws = new WebSocket(`ws://${window.location.hostname}:${RSF_PORT}/runtime-ui`)

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'render') {
            handleEvent(msg as RenderEvent)
          } else if (msg.type === 'graph-update' && onGraphUpdate) {
            // D2: CLI pushed a new graph due to file change
            onGraphUpdate(msg.graph as GraphData)
          } else if (msg.type === 'history' && Array.isArray(msg.events)) {
            // D3: Replay render history from CLI (e.g. after browser refresh)
            for (const evt of msg.events as RenderEvent[]) {
              if (evt.type === 'render') handleHistoricalEvent(evt)
            }
            // Emit one update with all replayed counts, no flash
            onUpdate({ ...stateRef.current, recentlyRendered: new Set() })
          }
        } catch {}
      })

      ws.addEventListener('open', () => {
        reconnectDelay = 2000  // reset on success
      })

      ws.addEventListener('close', () => {
        if (!destroyed) {
          setTimeout(connect, reconnectDelay)
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
        }
      })
    }

    connect()

    return () => {
      destroyed = true
      ws?.close()
      timersRef.current.forEach(clearTimeout)
    }
  }, [handleEvent, handleHistoricalEvent, onUpdate, onGraphUpdate])
}
