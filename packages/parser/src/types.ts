export type NodeType = 'component' | 'context'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  file: string
  line: number
  stateSlots: string[]       // useState/useReducer variable names
  isContextProvider: boolean
  contextName?: string       // which context it provides/consumes
}

export type EdgeType = 'parent-child' | 'context-subscription' | 'context-provision'

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
