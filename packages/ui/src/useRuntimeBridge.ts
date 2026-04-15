import { useEffect, useRef, useCallback } from 'react'
import type { RenderEvent, RuntimeState } from './types.js'

const FLASH_DURATION = 800 // ms

export function useRuntimeBridge(
  onUpdate: (state: RuntimeState) => void,
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

  useEffect(() => {
    let ws: WebSocket | null = null
    let destroyed = false

    function connect() {
      if (destroyed) return
      ws = new WebSocket(`ws://${window.location.hostname}:7272/runtime-ui`)

      ws.addEventListener('message', (e) => {
        try {
          const event = JSON.parse(e.data) as RenderEvent
          if (event.type === 'render') handleEvent(event)
        } catch {}
      })

      ws.addEventListener('close', () => {
        if (!destroyed) setTimeout(connect, 2000)
      })
    }

    connect()

    return () => {
      destroyed = true
      ws?.close()
      timersRef.current.forEach(clearTimeout)
    }
  }, [handleEvent])
}
