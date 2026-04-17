import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'
import type { ReduxHookKind } from '../project-index.js'
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
        const id = path.node.id
        if (!t.isIdentifier(id)) return

        const hookKind = getReduxHookKindFromExpression(init, ctx)
        if (hookKind && isReduxHookName(id.name)) {
          ctx.addReduxHookAlias(id.name, hookKind)
        }

        if (!t.isCallExpression(init) || !isReduxStoreFactory(init.callee, ctx)) return

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
      FunctionDeclaration: (path: any) => {
        const name = path.node.id?.name
        if (!name || !isReduxHookName(name)) return
        const hookKind = getReduxHookKindFromFunction(path.node, ctx)
        if (hookKind) ctx.addReduxHookAlias(name, hookKind)
      },
    })
  }

  enrichComponent(component: ComponentInfo, ctx: ParseContext): void {
    let usesRedux = false
    component.path.traverse({
      CallExpression(innerPath: any) {
        if (getReduxHookKindFromExpression(innerPath.node.callee, ctx)) {
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

function isReduxStoreFactory(callee: t.Node, ctx: ParseContext): boolean {
  return getReduxStoreFactoryName(callee, ctx) !== undefined
}

function getReduxStoreFactoryName(
  callee: t.Node,
  ctx: ParseContext,
): 'configureStore' | 'createStore' | undefined {
  if (t.isIdentifier(callee)) {
    if (callee.name === 'configureStore' || callee.name === 'createStore') {
      return callee.name
    }
    const binding = ctx.getImportBinding(callee.name)
    if (!binding || !isReduxStoreSource(binding.source)) return undefined
    if (binding.importedName === 'configureStore' || binding.importedName === 'createStore') {
      return binding.importedName
    }
    return undefined
  }

  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.property) &&
    (callee.property.name === 'configureStore' || callee.property.name === 'createStore') &&
    t.isIdentifier(callee.object)
  ) {
    const binding = ctx.getImportBinding(callee.object.name)
    if (binding?.importedName === '*' && isReduxStoreSource(binding.source)) {
      return callee.property.name
    }
  }

  return undefined
}

function getReduxHookKindFromFunction(
  fn: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
  ctx: ParseContext,
): ReduxHookKind | undefined {
  let hookKind: ReduxHookKind | undefined
  const body = fn.body

  if (t.isExpression(body)) {
    return getReduxHookKindFromExpression(body, ctx)
  }

  traverse(t.file(t.program(body.body)), {
    noScope: true,
    CallExpression(path: any) {
      hookKind ??= getReduxHookKindFromExpression(path.node.callee, ctx)
      if (hookKind) path.stop()
    },
  })

  return hookKind
}

function getReduxHookKindFromExpression(
  node: t.Node | null | undefined,
  ctx: ParseContext,
): ReduxHookKind | undefined {
  if (!node) return undefined

  if (t.isIdentifier(node)) {
    const localKind = ctx.resolveReduxHookKind(node.name)
    if (localKind) return localKind

    const binding = ctx.getImportBinding(node.name)
    if (binding?.source === 'react-redux') {
      if (binding.importedName === 'useDispatch') return 'dispatch'
      if (binding.importedName === 'useSelector') return 'selector'
    }

    if (node.name === 'useDispatch') return 'dispatch'
    if (node.name === 'useSelector') return 'selector'
    return undefined
  }

  if (
    t.isMemberExpression(node) &&
    t.isIdentifier(node.property) &&
    t.isIdentifier(node.object)
  ) {
    if (node.property.name === 'useDispatch' || node.property.name === 'useSelector') {
      const binding = ctx.getImportBinding(node.object.name)
      if (binding?.source === 'react-redux' && binding.importedName === '*') {
        return node.property.name === 'useDispatch' ? 'dispatch' : 'selector'
      }
    }

    if (node.property.name === 'withTypes') {
      return getReduxHookKindFromExpression(node.object, ctx)
    }
  }

  if (t.isCallExpression(node)) {
    return getReduxHookKindFromExpression(node.callee, ctx)
  }

  if (t.isTSInstantiationExpression(node)) {
    return getReduxHookKindFromExpression(node.expression, ctx)
  }

  if (t.isTSAsExpression(node) || t.isTSTypeAssertion(node)) {
    return getReduxHookKindFromExpression(node.expression, ctx)
  }

  return undefined
}

function isReduxHookName(name: string): boolean {
  return /^use[A-Z]/.test(name)
}

function isReduxStoreSource(source: string): boolean {
  return source === '@reduxjs/toolkit' || source === 'redux'
}
