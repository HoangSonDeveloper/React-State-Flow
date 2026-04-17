import * as t from '@babel/types'
import type { ComponentInfo, Detector, ParseContext } from './types.js'
import { discoverComponents, isComponentName } from './discover-components.js'
import { createEdgeId } from '../symbol-id.js'

/**
 * Creates parent-child edges from JSX usage.
 * Runs in phase 3 so it can resolve same-file declarations first, then imports.
 */
export class JSXChildrenDetector implements Detector {
  readonly name = 'jsx-children'

  detectEdges(ctx: ParseContext): void {
    discoverComponents(ctx.ast, ctx.filePath, (component) => {
      this.extractChildren(component, ctx)
    })
  }

  private extractChildren(component: ComponentInfo, ctx: ParseContext): void {
    const parentId = ctx.createNodeId('component', component.symbolKey)

    component.path.traverse({
      JSXOpeningElement(innerPath: any) {
        const el = innerPath.node.name
        let child = undefined

        if (t.isJSXIdentifier(el) && isComponentName(el.name)) {
          child = ctx.resolveLocalOrImportedSymbol(el.name, 'component')
        }

        if (!child && t.isJSXMemberExpression(el)) {
          const namespaceName = t.isJSXIdentifier(el.object) ? el.object.name : undefined
          const memberName = t.isJSXIdentifier(el.property) ? el.property.name : undefined
          if (namespaceName && memberName) {
            child = ctx.resolveImportedMemberSymbol(namespaceName, memberName, 'component')
              ?? ctx.resolveLocalOrImportedSymbol(namespaceName, 'component')
          }
        }

        if (!child) return

        ctx.addEdge({
          id: createEdgeId('parent-child', parentId, child.id),
          source: parentId,
          target: child.id,
          type: 'parent-child',
        })
      },
    })
  }
}
