export type NodeType = 'component' | 'context' | 'store'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  file: string
  line: number
  stateSlots: string[]       // useState/useReducer variable names
  isContextProvider: boolean
  contextName?: string       // which context it provides/consumes
  storeLibrary?: 'redux' | 'zustand'
}

export type EdgeType = 'parent-child' | 'context-subscription' | 'context-provision' | 'store-subscription'

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
