import type * as t from '@babel/types'
import type { GraphNode, GraphEdge } from '../types.js'

/** Info about a component discovered in the second pass. */
export interface ComponentInfo {
  name: string
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
  readonly externalComponents?: ReadonlySet<string>
  /**
   * Shared registry of store-hook names → store node id, populated across files.
   * Used by detectors (e.g. Zustand) whose hook names are user-defined and must
   * be resolved even when the hook is consumed in a different file than the
   * `create()` declaration.
   */
  readonly globalStores: Map<string, string>
  /**
   * Shared registry of Redux store names declared via `configureStore` / `createStore`.
   * Populated during phase 1 across all files; consumed during phase 2 by the Redux
   * detector to wire `useSelector`/`useDispatch` edges to known stores.
   * `useSelector` cannot reference its store directly, so when multiple Redux stores
   * exist in a project we connect the consuming component to all of them.
   */
  readonly globalReduxStores: Set<string>
  addNode(node: GraphNode): void
  addEdge(edge: GraphEdge): void
  hasNode(id: string): boolean
  registerComponent(name: string): void
  getComponentSet(): ReadonlySet<string>
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
