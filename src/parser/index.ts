import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import type * as t from '@babel/types'
import { parseFileFromAst, parseSource } from './parse-file.js'
import { buildProjectIndex, collectModuleInfo, type FilePassData } from './project-index.js'
import { normalizePath } from './path-utils.js'
import type { GraphNode, GraphEdge } from './types.js'

export type { GraphNode, GraphEdge } from './types.js'

export interface GraphData {
  projectRoot: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']
const DEFAULT_IGNORES = ['node_modules', '.git', 'dist', 'build', '.next']

function collectFiles(dir: string, ignores: ReadonlySet<string>): string[] {
  const results: string[] = []

  for (const entry of readdirSync(dir)) {
    if (ignores.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, ignores))
    } else if (EXTENSIONS.some((ext) => full.endsWith(ext))) {
      results.push(full)
    }
  }

  return results
}

export interface ParseProjectOptions {
  /** Extra directory names to skip (merged with the built-in ignore list). */
  ignore?: string[]
}

export function parseProject(projectRoot: string, options: ParseProjectOptions = {}): GraphData {
  const ignores = new Set([...DEFAULT_IGNORES, ...(options.ignore ?? [])])
  const files = collectFiles(projectRoot, ignores)

  const cache: { ast: t.File; relPath: string }[] = []
  for (const file of files) {
    const code = readFileSync(file, 'utf-8')
    const relPath = normalizePath(relative(projectRoot, file))
    const ast = parseSource(code, relPath)
    if (ast) cache.push({ relPath, ast })
  }

  const firstPass: FilePassData[] = cache.map(({ ast, relPath }) => {
    const parsed = parseFileFromAst(ast, relPath, { metadataOnly: true })
    return {
      relPath,
      moduleInfo: collectModuleInfo(ast),
      localSymbols: parsed.metadata.localSymbols,
      anonymousDefaultSymbol: parsed.metadata.anonymousDefaultSymbol,
      reduxStoreIds: parsed.metadata.reduxStoreIds,
    }
  })

  const projectIndex = buildProjectIndex(projectRoot, firstPass)

  const allNodes: GraphNode[] = []
  const allEdges: GraphEdge[] = []

  for (const { ast, relPath } of cache) {
    const { nodes, edges } = parseFileFromAst(ast, relPath, { project: projectIndex })
    allNodes.push(...nodes)
    allEdges.push(...edges)
  }

  const seenNodes = new Set<string>()
  const uniqueNodes = allNodes.filter((node) => {
    if (seenNodes.has(node.id)) return false
    seenNodes.add(node.id)
    return true
  })

  const nodeIds = new Set(uniqueNodes.map((node) => node.id))
  const validEdges = allEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))

  const seenEdges = new Set<string>()
  const uniqueEdges = validEdges.filter((edge) => {
    if (seenEdges.has(edge.id)) return false
    seenEdges.add(edge.id)
    return true
  })

  return { projectRoot, nodes: uniqueNodes, edges: uniqueEdges }
}
