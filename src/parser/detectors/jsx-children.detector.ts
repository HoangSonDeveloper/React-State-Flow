import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { Detector, ParseContext } from './types.js'
import { isReactComponentSuper, isComponentName } from './discover-components.js'

const traverse = (_traverse as any).default ?? _traverse

/**
 * Creates parent-child edges from JSX usage.
 * Runs in phase 3 so it can see every component discovered in this file
 * (or globally via ctx.externalComponents for cross-file resolution).
 */
export class JSXChildrenDetector implements Detector {
  readonly name = 'jsx-children'

  detectEdges(ctx: ParseContext): void {
    const known = ctx.externalComponents ?? ctx.getComponentSet()

    traverse(ctx.ast, {
      FunctionDeclaration: (path: any) => {
        this.extractChildren(path, ctx, known)
      },
      VariableDeclarator: (path: any) => {
        if (!t.isIdentifier(path.node.id)) return
        const name = path.node.id.name
        if (!isComponentName(name)) return

        const init = path.node.init
        const isFn = t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)
        const isWrapped = t.isCallExpression(init)
        if (isFn || isWrapped) {
          this.extractChildren(path, ctx, known, name)
        }
      },
      ClassDeclaration: (path: any) => {
        if (!isReactComponentSuper(path.node.superClass)) return
        this.extractChildren(path, ctx, known)
      },
    })
  }

  private extractChildren(
    path: any,
    ctx: ParseContext,
    known: ReadonlySet<string>,
    parentOverride?: string,
  ): void {
    const parentName = parentOverride ?? (path.node.id?.name as string | undefined)
    if (!parentName || !isComponentName(parentName)) return

    path.traverse({
      JSXOpeningElement(innerPath: any) {
        const el = innerPath.node.name
        let childName: string | undefined

        if (t.isJSXIdentifier(el) && isComponentName(el.name)) {
          childName = el.name
        }

        // <Namespace.Component /> — treat Namespace as the reference
        if (!childName && t.isJSXMemberExpression(el)) {
          const ns = t.isJSXIdentifier(el.object) ? el.object.name : undefined
          if (ns && known.has(ns)) childName = ns
        }

        if (!childName || !known.has(childName)) return

        ctx.addEdge({
          id: `${parentName}->${childName}`,
          source: parentName,
          target: childName,
          type: 'parent-child',
        })
      },
    })
  }
}
