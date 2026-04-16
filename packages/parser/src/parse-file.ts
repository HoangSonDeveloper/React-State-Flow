import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { GraphNode, GraphEdge } from './types.js'

// @babel/traverse ESM interop
const traverse = (_traverse as any).default ?? _traverse

interface FileResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name)
}

function getStateSlots(path: any): string[] {
  const slots: string[] = []
  path.traverse({
    CallExpression(innerPath: any) {
      const callee = innerPath.node.callee
      const isHook =
        (t.isIdentifier(callee, { name: 'useState' }) ||
          t.isIdentifier(callee, { name: 'useReducer' })) &&
        t.isIdentifier(callee)

      if (!isHook) return

      // useState([initialValue]) → destructure [state, setState]
      const parent = innerPath.parentPath
      if (
        parent?.isVariableDeclarator() &&
        t.isArrayPattern(parent.node.id)
      ) {
        const first = parent.node.id.elements[0]
        if (t.isIdentifier(first)) slots.push(first.name)
      }
    },
  })
  return slots
}

function getContextUsages(path: any): string[] {
  const names: string[] = []
  path.traverse({
    CallExpression(innerPath: any) {
      const callee = innerPath.node.callee
      if (!t.isIdentifier(callee, { name: 'useContext' })) return
      const arg = innerPath.node.arguments[0]
      if (t.isIdentifier(arg)) names.push(arg.name)
    },
  })
  return names
}

// A1: Accept optional externalComponents for cross-file edge resolution
export function parseFile(
  code: string,
  filePath: string,
  externalComponents?: Set<string>,
): FileResult {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  let ast: t.File
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
    })
  } catch (err: unknown) {
    // A7: Log parse errors instead of silently swallowing them
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[RSF] Failed to parse ${filePath}: ${msg}`)
    return { nodes, edges }
  }

  // Map: context variable name → node id
  const contextMap = new Map<string, string>()

  // Track component names found in this file for JSX child resolution
  const componentSet = new Set<string>()

  // A5: Use Set for O(1) edge deduplication
  const edgeIdSet = new Set<string>()

  function registerComponent(
    name: string,
    path: any,
    line: number,
  ): GraphNode {
    const stateSlots = getStateSlots(path)
    const contextUsages = getContextUsages(path)

    // Detect if this component renders a Context.Provider
    let isContextProvider = false
    let contextName: string | undefined
    path.traverse({
      JSXOpeningElement(innerPath: any) {
        const el = innerPath.node.name
        // <XxxContext.Provider>
        if (
          t.isJSXMemberExpression(el) &&
          t.isJSXIdentifier(el.property, { name: 'Provider' }) &&
          t.isJSXIdentifier(el.object)
        ) {
          isContextProvider = true
          contextName = el.object.name
        }
      },
    })

    const node: GraphNode = {
      id: name,
      type: 'component',
      label: name,
      file: filePath,
      line,
      stateSlots,
      isContextProvider,
      contextName,
    }
    nodes.push(node)
    componentSet.add(name)

    // Add context-subscription edges
    for (const ctxName of contextUsages) {
      const ctxId = contextMap.get(ctxName) ?? ctxName
      const edgeId = `${ctxId}->${name}`
      if (!edgeIdSet.has(edgeId)) {
        edgeIdSet.add(edgeId)
        edges.push({
          id: edgeId,
          source: ctxId,
          target: name,
          type: 'context-subscription',
        })
      }
    }

    // A4: Create Provider → Context edge
    if (isContextProvider && contextName) {
      const ctxId = contextMap.get(contextName) ?? contextName
      const edgeId = `${name}->${ctxId}:provides`
      if (!edgeIdSet.has(edgeId)) {
        edgeIdSet.add(edgeId)
        edges.push({
          id: edgeId,
          source: name,
          target: ctxId,
          type: 'context-provision',
        })
      }
    }

    return node
  }

  // First pass: find createContext calls to build contextMap
  traverse(ast, {
    VariableDeclarator(path: any) {
      if (
        t.isCallExpression(path.node.init) &&
        t.isIdentifier((path.node.init as t.CallExpression).callee, {
          name: 'createContext',
        }) &&
        t.isIdentifier(path.node.id)
      ) {
        const ctxVarName = path.node.id.name
        const nodeId = ctxVarName
        contextMap.set(ctxVarName, nodeId)
        nodes.push({
          id: nodeId,
          type: 'context',
          label: ctxVarName,
          file: filePath,
          line: path.node.loc?.start.line ?? 0,
          stateSlots: [],
          isContextProvider: false,
        })
      }
    },
  })

  // Second pass: find component declarations
  traverse(ast, {
    // function MyComponent() { ... }
    FunctionDeclaration(path: any) {
      const name = path.node.id?.name
      if (name && isComponentName(name)) {
        registerComponent(name, path, path.node.loc?.start.line ?? 0)
      }
    },

    // const MyComponent = () => { ... } or function() { ... } or memo(...) etc.
    VariableDeclarator(path: any) {
      if (!t.isIdentifier(path.node.id)) return
      const name = path.node.id.name
      if (!isComponentName(name)) return
      const init = path.node.init
      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        registerComponent(name, path, path.node.loc?.start.line ?? 0)
        return
      }
      // A2: HOC / memo / forwardRef wrapping a function
      if (t.isCallExpression(init)) {
        const firstArg = (init as t.CallExpression).arguments[0]
        if (
          firstArg &&
          (t.isArrowFunctionExpression(firstArg) ||
            t.isFunctionExpression(firstArg) ||
            t.isIdentifier(firstArg))
        ) {
          registerComponent(name, path, path.node.loc?.start.line ?? 0)
        }
      }
    },

    // A3: export default function() { ... } — derive name from filename
    ExportDefaultDeclaration(path: any) {
      const decl = path.node.declaration
      const isAnonFn =
        (t.isFunctionDeclaration(decl) || t.isArrowFunctionExpression(decl)) &&
        !(decl as any).id
      if (!isAnonFn) return
      const base = filePath.split('/').pop() ?? filePath
      const name = base.replace(/\.[^.]+$/, '')
      if (!isComponentName(name)) return
      registerComponent(name, path, path.node.loc?.start.line ?? 0)
    },
  })

  // Third pass: find JSX parent→child relationships
  traverse(ast, {
    FunctionDeclaration(path: any) {
      extractJSXChildren(path, edges, edgeIdSet, componentSet, externalComponents)
    },
    VariableDeclarator(path: any) {
      if (!t.isIdentifier(path.node.id)) return
      const name = path.node.id.name
      if (!isComponentName(name)) return
      const init = path.node.init
      const isFn = t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)
      const isWrapped = t.isCallExpression(init)
      if (isFn || isWrapped) {
        extractJSXChildren(path, edges, edgeIdSet, componentSet, externalComponents, name)
      }
    },
  })

  return { nodes, edges }
}

function extractJSXChildren(
  path: any,
  edges: GraphEdge[],
  edgeIdSet: Set<string>,
  componentSet: Set<string>,
  externalComponents?: Set<string>,
  parentNameOverride?: string,
): void {
  const parentName =
    parentNameOverride ??
    (path.node.id?.name as string | undefined)
  if (!parentName || !isComponentName(parentName)) return

  // A1: Use externalComponents (global set) when available for cross-file resolution
  const allKnown = externalComponents ?? componentSet

  path.traverse({
    JSXOpeningElement(innerPath: any) {
      const el = innerPath.node.name
      let childName: string | undefined

      if (t.isJSXIdentifier(el) && isComponentName(el.name)) {
        childName = el.name
      }

      // A6: Handle <Namespace.Component /> — use namespace as the component reference
      if (!childName && t.isJSXMemberExpression(el)) {
        const ns = t.isJSXIdentifier(el.object) ? el.object.name : undefined
        if (ns && allKnown.has(ns)) childName = ns
      }

      if (!childName || !allKnown.has(childName)) return

      const edgeId = `${parentName}->${childName}`
      if (edgeIdSet.has(edgeId)) return  // A5: O(1) check
      edgeIdSet.add(edgeId)
      edges.push({
        id: edgeId,
        source: parentName,
        target: childName,
        type: 'parent-child',
      })
    },
  })
}
