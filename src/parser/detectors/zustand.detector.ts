import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'

const traverse = (_traverse as any).default ?? _traverse

/**
 * Zustand detector.
 *   - Phase 1: finds `const useXxxStore = create(…)` → adds store node named XxxStore
 *     and records the hook→store mapping in `ctx.globalStores` so cross-file
 *     component files can resolve the hook in phase 2.
 *     Only variables matching `use[A-Z]...` are considered; the `use` prefix is stripped
 *     to form the node id.
 *   - Phase 2: for each component, if it calls a hook registered in `ctx.globalStores`,
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

        const callee = (init as t.CallExpression).callee
        if (!t.isIdentifier(callee, { name: 'create' })) return

        const storeId = stripUsePrefix(id.name)
        if (!storeId) return

        ctx.globalStores.set(id.name, storeId)
        ctx.addNode({
          id: storeId,
          type: 'store',
          label: storeId,
          file: ctx.filePath,
          line: path.node.loc?.start.line ?? 0,
          stateSlots: [],
          isContextProvider: false,
          storeLibrary: 'zustand',
        })
      },
    })
  }

  enrichComponent(component: ComponentInfo, ctx: ParseContext): void {
    const storeIds = new Set<string>()
    const hookMap = ctx.globalStores
    component.path.traverse({
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        if (!t.isIdentifier(callee)) return
        const storeId = hookMap.get(callee.name)
        if (storeId) storeIds.add(storeId)
      },
    })

    for (const storeId of storeIds) {
      ctx.addEdge({
        id: `${storeId}->${component.name}`,
        source: storeId,
        target: component.name,
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
