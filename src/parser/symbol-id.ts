import type { EdgeType, NodeType } from './types.js'
import { normalizePath } from './path-utils.js'

export const REDUX_AMBIGUOUS_STORE_LABEL = 'ReduxStore?'
export const REDUX_AMBIGUOUS_STORE_ID = 'store:(virtual)#ReduxStore?'
export const REDUX_AMBIGUOUS_STORE_FILE = '(virtual)'

export function createNodeId(type: NodeType, filePath: string, symbol: string): string {
  return `${type}:${normalizePath(filePath)}#${symbol}`
}

export function createEdgeId(type: EdgeType, source: string, target: string): string {
  return `${type}:${source}->${target}`
}
