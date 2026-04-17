import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type {
  ComponentEnrichment,
  ComponentInfo,
  Detector,
  ParseContext,
} from './types.js'
import type { GraphNode } from '../types.js'
import { createEdgeId } from '../symbol-id.js'

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

  detectDeclarations(ctx: ParseContext): void {
    traverse(ctx.ast, {
      VariableDeclarator: (path: any) => {
        const init = path.node.init
        const id = path.node.id
        if (!t.isCallExpression(init) || !t.isIdentifier(id)) return

        const callee = (init as t.CallExpression).callee
        if (!isReactHookCall(callee, ctx, 'createContext')) return

        const name = id.name
        const node: GraphNode = {
          id: ctx.createNodeId('context', name),
          type: 'context',
          label: name,
          file: ctx.filePath,
          line: path.node.loc?.start.line ?? 0,
          stateSlots: [],
          isContextProvider: false,
        }
        ctx.addNode(node)
        ctx.addLocalSymbol(name, node)
      },
    })
  }

  enrichComponent(component: ComponentInfo, ctx: ParseContext): ComponentEnrichment {
    const contextUsages = new Set<string>()
    let isContextProvider = false
    let contextName: string | undefined
    const componentId = ctx.createNodeId('component', component.symbolKey)

    component.path.traverse({
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        if (!isReactHookCall(callee, ctx, 'useContext')) return
        const arg = innerPath.node.arguments[0]
        if (!t.isIdentifier(arg)) return
        const resolved = ctx.resolveLocalOrImportedSymbol(arg.name, 'context')
        if (resolved) contextUsages.add(resolved.id)
      },
      // Class component: `static contextType = ThemeContext`
      ClassProperty(innerPath: any) {
        const node = innerPath.node
        if (
          node.static &&
          t.isIdentifier(node.key, { name: 'contextType' }) &&
          t.isIdentifier(node.value)
        ) {
          const resolved = ctx.resolveLocalOrImportedSymbol(node.value.name, 'context')
          if (resolved) contextUsages.add(resolved.id)
        }
      },
      JSXOpeningElement(innerPath: any) {
        const el = innerPath.node.name
        // <XxxContext.Provider>
        if (
          t.isJSXMemberExpression(el) &&
          t.isJSXIdentifier(el.property, { name: 'Provider' }) &&
          t.isJSXIdentifier(el.object)
        ) {
          const resolved = ctx.resolveLocalOrImportedSymbol(el.object.name, 'context')
          if (!resolved) return
          isContextProvider = true
          contextName = resolved.label
          ctx.addEdge({
            id: createEdgeId('context-provision', componentId, resolved.id),
            source: componentId,
            target: resolved.id,
            type: 'context-provision',
          })
        }
      },
    })

    // context-subscription edges
    for (const ctxId of contextUsages) {
      ctx.addEdge({
        id: createEdgeId('context-subscription', ctxId, componentId),
        source: ctxId,
        target: componentId,
        type: 'context-subscription',
      })
    }

    return { isContextProvider, contextName }
  }
}

function isReactHookCall(
  callee: t.Node,
  ctx: ParseContext,
  hookName: 'createContext' | 'useContext',
): boolean {
  if (t.isIdentifier(callee, { name: hookName })) return true

  if (t.isIdentifier(callee)) {
    const binding = ctx.getImportBinding(callee.name)
    return binding?.source === 'react' && binding.importedName === hookName
  }

  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.property, { name: hookName }) &&
    t.isIdentifier(callee.object)
  ) {
    const binding = ctx.getImportBinding(callee.object.name)
    return binding?.source === 'react' && binding.importedName === '*'
  }

  return false
}
