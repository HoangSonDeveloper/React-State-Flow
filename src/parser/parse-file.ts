import { parse } from '@babel/parser'
import * as t from '@babel/types'
import type { GraphEdge, GraphNode, NodeType } from './types.js'
import {
  createDefaultDetectors,
  discoverComponents,
  type Detector,
  type ParseContext,
} from './detectors/index.js'
import type { ProjectIndex } from './project-index.js'
import { createNodeId, REDUX_AMBIGUOUS_STORE_ID } from './symbol-id.js'

export interface FileParseMetadata {
  anonymousDefaultSymbol?: GraphNode
  localSymbols: Map<string, GraphNode>
  reduxStoreIds: string[]
}

export interface FileResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata: FileParseMetadata
}

export interface ParseFileOptions {
  detectors?: Detector[]
  project?: ProjectIndex
}

/**
 * Parses source code into a Babel AST. Returns `null` and warns on syntax errors
 * so the caller can decide what to do (parseFile/parseFileFromAst skip those files).
 * Exposed so `parseProject` can cache ASTs across passes.
 */
export function parseSource(code: string, filePath: string): t.File | null {
  try {
    return parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[RSF] Failed to parse ${filePath}: ${msg}`)
    return null
  }
}

/**
 * Parses a single file and returns the nodes/edges it contributes to the graph.
 * Orchestration only — all detection logic lives in `./detectors/*`.
 */
export function parseFile(
  code: string,
  filePath: string,
  options: ParseFileOptions = {},
): FileResult {
  const ast = parseSource(code, filePath)
  if (!ast) return { nodes: [], edges: [], metadata: { localSymbols: new Map(), reduxStoreIds: [] } }
  return parseFileFromAst(ast, filePath, options)
}

/**
 * Same as `parseFile`, but accepts a pre-parsed AST. Used by `parseProject` to
 * avoid re-parsing the same file across passes.
 */
export function parseFileFromAst(
  ast: t.File,
  filePath: string,
  options: ParseFileOptions = {},
): FileResult {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIdSet = new Set<string>()
  const edgeIdSet = new Set<string>()
  const localSymbols = new Map<string, GraphNode>()
  let anonymousDefaultSymbol: GraphNode | undefined
  const detectors = options.detectors ?? createDefaultDetectors()

  const ctx: ParseContext = {
    ast,
    filePath,
    project: options.project,
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
    addLocalSymbol(localName, node) {
      localSymbols.set(localName, node)
    },
    setAnonymousDefaultSymbol(node) {
      anonymousDefaultSymbol = node
    },
    resolveLocalOrImportedSymbol(localName, expectedType) {
      const local = filterNodeType(localSymbols.get(localName), expectedType)
      if (local) return local
      return filterNodeType(options.project?.resolveImportedSymbol(filePath, localName), expectedType)
    },
    resolveImportedMemberSymbol(namespaceName, memberName, expectedType) {
      return filterNodeType(
        options.project?.resolveImportedMemberSymbol(filePath, namespaceName, memberName),
        expectedType,
      )
    },
    getReduxSubscriptionTarget() {
      const projectStore = options.project?.getSingleReduxStore()
      if (projectStore) return projectStore

      const localReduxStores = [...localSymbols.values()].filter(
        (node) => node.type === 'store' && node.storeLibrary === 'redux',
      )
      if (!options.project && localReduxStores.length === 1) {
        return localReduxStores[0]
      }

      return options.project?.getAmbiguousReduxStore() ?? {
        id: REDUX_AMBIGUOUS_STORE_ID,
        type: 'store',
        label: 'ReduxStore?',
        file: '(virtual)',
        line: 0,
        stateSlots: [],
        isContextProvider: false,
        storeLibrary: 'redux',
      }
    },
    createNodeId(type, symbolKey) {
      return createNodeId(type, filePath, symbolKey)
    },
  }

  for (const detector of detectors) detector.detectDeclarations?.(ctx)

  discoverComponents(ast, filePath, (component) => {
    const features = {
      stateSlots: [] as string[],
      isContextProvider: false,
      contextName: undefined as string | undefined,
    }

    for (const detector of detectors) {
      const enrichment = detector.enrichComponent?.(component, ctx)
      if (!enrichment) continue
      if (enrichment.stateSlots) features.stateSlots = enrichment.stateSlots
      if (enrichment.isContextProvider !== undefined) features.isContextProvider = enrichment.isContextProvider
      if (enrichment.contextName !== undefined) features.contextName = enrichment.contextName
    }

    const node: GraphNode = {
      id: ctx.createNodeId('component', component.symbolKey),
      type: 'component',
      label: component.name,
      file: filePath,
      line: component.line,
      stateSlots: features.stateSlots,
      isContextProvider: features.isContextProvider,
      contextName: features.contextName,
    }
    ctx.addNode(node)
    if (component.bindingName) {
      ctx.addLocalSymbol(component.bindingName, node)
    } else if (component.symbolKey === 'default') {
      ctx.setAnonymousDefaultSymbol(node)
    }
  })

  for (const detector of detectors) detector.detectEdges?.(ctx)

  return {
    nodes,
    edges,
    metadata: {
      anonymousDefaultSymbol,
      localSymbols,
      reduxStoreIds: [...new Set(
        [...localSymbols.values()]
          .filter((node) => node.type === 'store' && node.storeLibrary === 'redux')
          .map((node) => node.id),
      )],
    },
  }
}

function filterNodeType(node: GraphNode | undefined, expectedType?: NodeType): GraphNode | undefined {
  if (!node) return undefined
  if (!expectedType || node.type === expectedType) return node
  return undefined
}
