import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { parseFile } from './parse-file.js'
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

  // Shared across both passes: hook name → store node id, populated as each
  // file's detectors run. Lets cross-file store hooks resolve in pass 2 even
  // when the `create()` declaration lives in a different file.
  const globalStores = new Map<string, string>()

  // Pass 1: collect all component node ids for cross-file edge resolution
  const globalComponentSet = new Set<string>()
  for (const file of files) {
    const code = readFileSync(file, 'utf-8')
    const relPath = relative(projectRoot, file)
    const { nodes } = parseFile(code, relPath, undefined, globalStores)
    for (const n of nodes) {
      if (n.type === 'component') globalComponentSet.add(n.id)
    }
  }

  // Pass 2: full parse with global component set for cross-file edges
  const allNodes: GraphNode[] = []
  const allEdges: GraphEdge[] = []
  for (const file of files) {
    const code = readFileSync(file, 'utf-8')
    const relPath = relative(projectRoot, file)
    const { nodes, edges } = parseFile(code, relPath, globalComponentSet, globalStores)
    allNodes.push(...nodes)
    allEdges.push(...edges)
  }

  // Deduplicate nodes by id (keep first occurrence)
  const seen = new Set<string>()
  const uniqueNodes = allNodes.filter((n) => {
    if (seen.has(n.id)) return false
    seen.add(n.id)
    return true
  })

  // Remove edges referencing unknown nodes
  const nodeIds = new Set(uniqueNodes.map((n) => n.id))
  const validEdges = allEdges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  )

  // Deduplicate edges
  const edgeSeen = new Set<string>()
  const uniqueEdges = validEdges.filter((e) => {
    if (edgeSeen.has(e.id)) return false
    edgeSeen.add(e.id)
    return true
  })

  return { projectRoot, nodes: uniqueNodes, edges: uniqueEdges }
}
