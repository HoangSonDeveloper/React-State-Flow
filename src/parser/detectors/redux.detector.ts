import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'

const traverse = (_traverse as any).default ?? _traverse

/** Fallback node id used when a component calls useSelector/useDispatch but no store declaration was discovered. */
const FALLBACK_REDUX_STORE_ID = 'ReduxStore'

/**
 * Redux detector.
 *   - Phase 1: for each `const xxx = configureStore(…)` / `createStore(…)` call, adds a
 *     store node whose id is the variable name, and records the name in
 *     `ctx.globalReduxStores` so phase 2 can resolve edges across files.
 *     Anonymous (non-`VariableDeclarator`) stores fall back to the shared id "ReduxStore".
 *   - Phase 2: for each component that uses `useSelector`/`useDispatch`, adds a
 *     store-subscription edge to every known Redux store. When none were discovered
 *     (e.g. store lives outside scanned files), lazily creates the `ReduxStore` fallback.
 */
export class ReduxDetector implements Detector {
  readonly name = 'redux'

  detectDeclarations(ctx: ParseContext): void {
    traverse(ctx.ast, {
      VariableDeclarator: (path: any) => {
        const init = path.node.init
        if (!t.isCallExpression(init)) return
        const callee = (init as t.CallExpression).callee
        if (!isReduxStoreFactory(callee)) return

        const id = path.node.id
        const storeId = t.isIdentifier(id) ? id.name : FALLBACK_REDUX_STORE_ID
        this.ensureStoreNode(ctx, storeId, path.node.loc?.start.line ?? 0)
        ctx.globalReduxStores.add(storeId)
      },
    })
  }

  enrichComponent(component: ComponentInfo, ctx: ParseContext): void {
    let usesRedux = false
    component.path.traverse({
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        if (!t.isIdentifier(callee)) return
        if (callee.name === 'useSelector' || callee.name === 'useDispatch') {
          usesRedux = true
        }
      },
    })

    if (!usesRedux) return

    const targets = ctx.globalReduxStores.size > 0
      ? [...ctx.globalReduxStores]
      : [FALLBACK_REDUX_STORE_ID]

    // Lazily create the fallback node when the store lives outside the scanned tree.
    if (ctx.globalReduxStores.size === 0) {
      this.ensureStoreNode(ctx, FALLBACK_REDUX_STORE_ID, component.line)
    }

    for (const storeId of targets) {
      ctx.addEdge({
        id: `${storeId}->${component.name}`,
        source: storeId,
        target: component.name,
        type: 'store-subscription',
      })
    }
  }

  private ensureStoreNode(ctx: ParseContext, id: string, line: number): void {
    if (ctx.hasNode(id)) return
    ctx.addNode({
      id,
      type: 'store',
      label: id,
      file: ctx.filePath,
      line,
      stateSlots: [],
      isContextProvider: false,
      storeLibrary: 'redux',
    })
  }
}

function isReduxStoreFactory(callee: t.Node): boolean {
  return (
    t.isIdentifier(callee, { name: 'configureStore' }) ||
    t.isIdentifier(callee, { name: 'createStore' })
  )
}
