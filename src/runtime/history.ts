import type { RuntimeRenderEvent } from './resolve-events.js'

export interface RuntimeHistorySnapshot {
  renderCounts: Record<string, number>
  wastedCounts: Record<string, number>
}

export function buildRuntimeHistorySnapshot(
  events: readonly RuntimeRenderEvent[],
): RuntimeHistorySnapshot {
  const renderCounts: Record<string, number> = {}
  const wastedCounts: Record<string, number> = {}

  for (const event of events) {
    if (!event.componentId) continue
    renderCounts[event.componentId] = event.renderCount
    if (event.isWasted) {
      wastedCounts[event.componentId] = (wastedCounts[event.componentId] ?? 0) + 1
    }
  }

  return { renderCounts, wastedCounts }
}
