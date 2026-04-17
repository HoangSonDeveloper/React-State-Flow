import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'
import type { GraphNode } from '../types.js'
import { REDUX_AMBIGUOUS_STORE_ID, createEdgeId } from '../symbol-id.js'

const traverse = (_traverse as any).default ?? _traverse

/**
 * Redux detector.
 *   - Phase 1: finds Redux store declarations.
 *   - Phase 2: connects consumers to the single exact store when the project has one,
 *     otherwise to a shared ambiguous virtual store node.
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
        if (!t.isIdentifier(id)) return

        const node: GraphNode = {
          id: ctx.createNodeId('store', id.name),
          type: 'store',
          label: id.name,
          file: ctx.filePath,
          line: path.node.loc?.start.line ?? 0,
          stateSlots: [],
          isContextProvider: false,
          storeLibrary: 'redux',
        }
        ctx.addNode(node)
        ctx.addLocalSymbol(id.name, node)
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

    const componentId = ctx.createNodeId('component', component.symbolKey)
    const target = ctx.getReduxSubscriptionTarget()

    if (target.id === REDUX_AMBIGUOUS_STORE_ID && !ctx.hasNode(target.id)) {
      ctx.addNode(target)
    }

    ctx.addEdge({
      id: createEdgeId('store-subscription', target.id, componentId),
      source: target.id,
      target: componentId,
      type: 'store-subscription',
    })
  }
}

function isReduxStoreFactory(callee: t.Node): boolean {
  return (
    t.isIdentifier(callee, { name: 'configureStore' }) ||
    t.isIdentifier(callee, { name: 'createStore' })
  )
}
