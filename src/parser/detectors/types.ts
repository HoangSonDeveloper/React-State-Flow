import type * as t from '@babel/types'
import type { GraphNode, GraphEdge, NodeType } from '../types.js'
import type { ProjectIndex } from '../project-index.js'

/** Info about a component discovered in the second pass. */
export interface ComponentInfo {
  name: string
  symbolKey: string
  bindingName?: string
  path: any
  line: number
}

/** Features contributed by an enricher to a component node. */
export interface ComponentEnrichment {
  stateSlots?: string[]
  isContextProvider?: boolean
  contextName?: string
}

/**
 * Shared context passed to every detector phase.
 * Detectors add nodes/edges via this context rather than returning them,
 * so cross-detector deduplication happens in one place.
 */
export interface ParseContext {
  readonly ast: t.File
  readonly filePath: string
  readonly project?: ProjectIndex
  addNode(node: GraphNode): void
  addEdge(edge: GraphEdge): void
  hasNode(id: string): boolean
  addLocalSymbol(localName: string, node: GraphNode): void
  setAnonymousDefaultSymbol(node: GraphNode): void
  resolveLocalOrImportedSymbol(localName: string, expectedType?: NodeType): GraphNode | undefined
  resolveImportedMemberSymbol(namespaceName: string, memberName: string, expectedType?: NodeType): GraphNode | undefined
  getReduxSubscriptionTarget(): GraphNode
  createNodeId(type: NodeType, symbolKey: string): string
}

/**
 * Detector lifecycle:
 *   1. detectDeclarations  — find standalone nodes (contexts, stores).
 *   2. enrichComponent     — invoked per discovered component; may add edges/features.
 *   3. detectEdges         — find edges that require the full component set (e.g. JSX children).
 *
 * Each phase is optional. Detectors are executed in registration order within a phase.
 */
export interface Detector {
  readonly name: string
  detectDeclarations?(ctx: ParseContext): void
  enrichComponent?(component: ComponentInfo, ctx: ParseContext): ComponentEnrichment | void
  detectEdges?(ctx: ParseContext): void
}
