export type NodeType = 'component' | 'context'
export type EdgeType = 'parent-child' | 'context-subscription'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  file: string
  line: number
  stateSlots: string[]
  isContextProvider: boolean
  contextName?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface RenderEvent {
  type: 'render'
  componentName: string
  renderCount: number
  timestamp: number
}

// Runtime state overlaid on top of static graph
export interface RuntimeState {
  renderCounts: Record<string, number>
  recentlyRendered: Set<string> // cleared after 800ms
}
