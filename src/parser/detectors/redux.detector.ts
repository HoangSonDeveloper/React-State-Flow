import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'

const traverse = (_traverse as any).default ?? _traverse

const REDUX_STORE_ID = 'ReduxStore'

/**
 * Redux detector.
 *   - Phase 1: finds `configureStore(…)` / `createStore(…)` → adds virtual ReduxStore node
 *   - Phase 2: for each component, if it uses useSelector/useDispatch, adds a
 *     store-subscription edge. Auto-creates the ReduxStore node on demand when the
 *     store declaration lives in a different file.
 */
export class ReduxDetector implements Detector {
  readonly name = 'redux'

  detectDeclarations(ctx: ParseContext): void {
    traverse(ctx.ast, {
      VariableDeclarator: (path: any) => {
        const init = path.node.init
        if (!t.isCallExpression(init)) return
        const callee = (init as t.CallExpression).callee
        if (
          t.isIdentifier(callee, { name: 'configureStore' }) ||
          t.isIdentifier(callee, { name: 'createStore' })
        ) {
          this.ensureStoreNode(ctx, path.node.loc?.start.line ?? 0)
        }
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

    this.ensureStoreNode(ctx, component.line)
    ctx.addEdge({
      id: `${REDUX_STORE_ID}->${component.name}`,
      source: REDUX_STORE_ID,
      target: component.name,
      type: 'store-subscription',
    })
  }

  private ensureStoreNode(ctx: ParseContext, line: number): void {
    if (ctx.hasNode(REDUX_STORE_ID)) return
    ctx.addNode({
      id: REDUX_STORE_ID,
      type: 'store',
      label: REDUX_STORE_ID,
      file: ctx.filePath,
      line,
      stateSlots: [],
      isContextProvider: false,
      storeLibrary: 'redux',
    })
  }
}
