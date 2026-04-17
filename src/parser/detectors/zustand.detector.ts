import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'
import type { GraphNode } from '../types.js'
import { createEdgeId } from '../symbol-id.js'

const traverse = (_traverse as any).default ?? _traverse

/**
 * Zustand detector.
 *   - Phase 1: finds `const useXxxStore = create(…)` (including aliased / generic
 *     `create<T>()(...)` forms) → adds a store node named XxxStore.
 *     Only variables matching `use[A-Z]...` are considered; the `use` prefix is stripped
 *     to form the node id.
 *   - Phase 2: for each component, if it calls a hook that resolves to a Zustand store,
 *     adds a store-subscription edge.
 */
export class ZustandDetector implements Detector {
  readonly name = 'zustand'

  detectDeclarations(ctx: ParseContext): void {
    traverse(ctx.ast, {
      VariableDeclarator: (path: any) => {
        const init = path.node.init
        const id = path.node.id
        if (!t.isCallExpression(init) || !t.isIdentifier(id)) return

        if (!isZustandCreateCall(init, ctx)) return

        const label = stripUsePrefix(id.name)
        if (!label) return

        const node: GraphNode = {
          id: ctx.createNodeId('store', id.name),
          type: 'store',
          label,
          file: ctx.filePath,
          line: path.node.loc?.start.line ?? 0,
          stateSlots: [],
          isContextProvider: false,
          storeLibrary: 'zustand',
        }
        ctx.addNode(node)
        ctx.addLocalSymbol(id.name, node)
      },
    })
  }

  enrichComponent(component: ComponentInfo, ctx: ParseContext): void {
    const storeIds = new Set<string>()
    const componentId = ctx.createNodeId('component', component.symbolKey)
    component.path.traverse({
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        if (!t.isIdentifier(callee)) return
        const resolved = ctx.resolveLocalOrImportedSymbol(callee.name, 'store')
        if (resolved?.storeLibrary === 'zustand') storeIds.add(resolved.id)
      },
    })

    for (const storeId of storeIds) {
      ctx.addEdge({
        id: createEdgeId('store-subscription', storeId, componentId),
        source: storeId,
        target: componentId,
        type: 'store-subscription',
      })
    }
  }
}

/** useCountStore → CountStore; returns null if the name doesn't match. */
function stripUsePrefix(name: string): string | null {
  if (!/^use[A-Z]/.test(name)) return null
  return name.slice(3)
}

function isZustandCreateCall(node: t.CallExpression, ctx: ParseContext): boolean {
  return getZustandCreateKind(node.callee, ctx)
}

function getZustandCreateKind(node: t.Node, ctx: ParseContext): boolean {
  if (t.isIdentifier(node)) {
    if (node.name === 'create') return true
    const binding = ctx.getImportBinding(node.name)
    return binding?.source === 'zustand' && binding.importedName === 'create'
  }

  if (
    t.isMemberExpression(node) &&
    t.isIdentifier(node.property, { name: 'create' }) &&
    t.isIdentifier(node.object)
  ) {
    const binding = ctx.getImportBinding(node.object.name)
    return binding?.source === 'zustand' && binding.importedName === '*'
  }

  if (t.isCallExpression(node)) {
    return getZustandCreateKind(node.callee, ctx)
  }

  if (t.isTSInstantiationExpression(node)) {
    return getZustandCreateKind(node.expression, ctx)
  }

  return false
}
