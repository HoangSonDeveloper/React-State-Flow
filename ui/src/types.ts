export type NodeType = 'component' | 'context' | 'store'
export type EdgeType = 'parent-child' | 'context-subscription' | 'context-provision' | 'store-subscription'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  file: string
  line: number
  stateSlots: string[]
  isContextProvider: boolean
  contextName?: string
  storeLibrary?: 'redux' | 'zustand'
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
}

export interface GraphData {
  projectRoot: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface RenderEvent {
  type: 'render'
  componentName: string
  componentId?: string
  renderCount: number
  timestamp: number
  isWasted?: boolean
}

// Runtime state overlaid on top of static graph
export interface RuntimeState {
  renderCounts: Record<string, number>
  recentlyRendered: Set<string>    // cleared after 800ms
  wastedCounts: Record<string, number>
  recentlyWasted: Set<string>      // cleared after 800ms
}
