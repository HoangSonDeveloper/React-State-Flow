import type { GraphData } from '../parser/index.js'

export interface RuntimeRenderEvent {
  type: 'render'
  componentName: string
  componentId?: string
  renderCount: number
  timestamp: number
  isWasted?: boolean
}

export interface RuntimeGraphIndex {
  duplicateComponentLabels: string[]
  uniqueComponentIdsByLabel: Map<string, string>
}

export function buildRuntimeGraphIndex(graph: GraphData): RuntimeGraphIndex {
  const counts = new Map<string, number>()
  const firstIdByLabel = new Map<string, string>()

  for (const node of graph.nodes) {
    if (node.type !== 'component') continue
    counts.set(node.label, (counts.get(node.label) ?? 0) + 1)
    if (!firstIdByLabel.has(node.label)) firstIdByLabel.set(node.label, node.id)
  }

  const uniqueComponentIdsByLabel = new Map<string, string>()
  const duplicateComponentLabels: string[] = []

  for (const [label, count] of counts) {
    if (count === 1) {
      const id = firstIdByLabel.get(label)
      if (id) uniqueComponentIdsByLabel.set(label, id)
    } else {
      duplicateComponentLabels.push(label)
    }
  }

  duplicateComponentLabels.sort()

  return { duplicateComponentLabels, uniqueComponentIdsByLabel }
}

export function resolveRuntimeRenderEvent(
  event: RuntimeRenderEvent,
  index: RuntimeGraphIndex,
): RuntimeRenderEvent {
  if (event.componentId) return event

  const resolvedId = index.uniqueComponentIdsByLabel.get(event.componentName)
  if (!resolvedId) return event

  return { ...event, componentId: resolvedId }
}
