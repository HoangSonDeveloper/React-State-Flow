import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type {
  ComponentEnrichment,
  ComponentInfo,
  Detector,
  ParseContext,
} from './types.js'

const traverse = (_traverse as any).default ?? _traverse

/**
 * React Context detector.
 *   - Phase 1: finds `const X = createContext(…)` → adds context node
 *   - Phase 2: for each component:
 *       - useContext(X) → context-subscription edge
 *       - <X.Provider> → context-provision edge (+ marks isContextProvider)
 */
export class ContextDetector implements Detector {
  readonly name = 'context'
  private readonly contextMap = new Map<string, string>()

  detectDeclarations(ctx: ParseContext): void {
    traverse(ctx.ast, {
      VariableDeclarator: (path: any) => {
        const init = path.node.init
        const id = path.node.id
        if (!t.isCallExpression(init) || !t.isIdentifier(id)) return

        const callee = (init as t.CallExpression).callee
        if (!t.isIdentifier(callee, { name: 'createContext' })) return

        const name = id.name
        this.contextMap.set(name, name)
        ctx.addNode({
          id: name,
          type: 'context',
          label: name,
          file: ctx.filePath,
          line: path.node.loc?.start.line ?? 0,
          stateSlots: [],
          isContextProvider: false,
        })
      },
    })
  }

  enrichComponent(component: ComponentInfo, ctx: ParseContext): ComponentEnrichment {
    const contextUsages: string[] = []
    let isContextProvider = false
    let contextName: string | undefined

    component.path.traverse({
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        if (!t.isIdentifier(callee, { name: 'useContext' })) return
        const arg = innerPath.node.arguments[0]
        if (t.isIdentifier(arg)) contextUsages.push(arg.name)
      },
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

    // context-subscription edges
    for (const ctxName of contextUsages) {
      const ctxId = this.contextMap.get(ctxName) ?? ctxName
      ctx.addEdge({
        id: `${ctxId}->${component.name}`,
        source: ctxId,
        target: component.name,
        type: 'context-subscription',
      })
    }

    // context-provision edge
    if (isContextProvider && contextName) {
      const ctxId = this.contextMap.get(contextName) ?? contextName
      ctx.addEdge({
        id: `${component.name}->${ctxId}:provides`,
        source: component.name,
        target: ctxId,
        type: 'context-provision',
      })
    }

    return { isContextProvider, contextName }
  }
}
