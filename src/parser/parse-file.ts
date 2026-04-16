import { parse } from '@babel/parser'
import * as t from '@babel/types'
import type { GraphEdge, GraphNode } from './types.js'
import {
  createDefaultDetectors,
  discoverComponents,
  type Detector,
  type ParseContext,
} from './detectors/index.js'

interface FileResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Parses a single file and returns the nodes/edges it contributes to the graph.
 * Orchestration only — all detection logic lives in `./detectors/*`.
 */
export function parseFile(
  code: string,
  filePath: string,
  externalComponents?: Set<string>,
  detectors: Detector[] = createDefaultDetectors(),
): FileResult {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIdSet = new Set<string>()
  const edgeIdSet = new Set<string>()
  const componentSet = new Set<string>()

  let ast: t.File
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[RSF] Failed to parse ${filePath}: ${msg}`)
    return { nodes, edges }
  }

  const ctx: ParseContext = {
    ast,
    filePath,
    externalComponents,
    addNode(node) {
      if (nodeIdSet.has(node.id)) return
      nodeIdSet.add(node.id)
      nodes.push(node)
    },
    addEdge(edge) {
      if (edgeIdSet.has(edge.id)) return
      edgeIdSet.add(edge.id)
      edges.push(edge)
    },
    hasNode(id) {
      return nodeIdSet.has(id)
    },
    registerComponent(name) {
      componentSet.add(name)
    },
    getComponentSet() {
      return componentSet
    },
  }

  // Phase 1: standalone declarations (contexts, stores)
  for (const d of detectors) d.detectDeclarations?.(ctx)

  // Phase 2: discover components and let each detector enrich/add edges
  discoverComponents(ast, filePath, (component) => {
    const features = { stateSlots: [] as string[], isContextProvider: false, contextName: undefined as string | undefined }
    for (const d of detectors) {
      const f = d.enrichComponent?.(component, ctx)
      if (!f) continue
      if (f.stateSlots) features.stateSlots = f.stateSlots
      if (f.isContextProvider !== undefined) features.isContextProvider = f.isContextProvider
      if (f.contextName !== undefined) features.contextName = f.contextName
    }
    ctx.addNode({
      id: component.name,
      type: 'component',
      label: component.name,
      file: filePath,
      line: component.line,
      stateSlots: features.stateSlots,
      isContextProvider: features.isContextProvider,
      contextName: features.contextName,
    })
    ctx.registerComponent(component.name)
  })

  // Phase 3: edges that need the full component set (e.g. JSX parent-child)
  for (const d of detectors) d.detectEdges?.(ctx)

  return { nodes, edges }
}
