import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo } from './types.js'

const traverse = (_traverse as any).default ?? _traverse

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name)
}

/**
 * Walks the AST and invokes `onComponent` for each React function component it finds.
 * Handles: function declarations, arrow/function expressions, HOC/memo/forwardRef wrapping,
 * and anonymous default exports (name derived from file path).
 */
export function discoverComponents(
  ast: t.File,
  filePath: string,
  onComponent: (c: ComponentInfo) => void,
): void {
  traverse(ast, {
    FunctionDeclaration(path: any) {
      const name = path.node.id?.name
      if (name && isComponentName(name)) {
        onComponent({ name, path, line: path.node.loc?.start.line ?? 0 })
      }
    },

    VariableDeclarator(path: any) {
      if (!t.isIdentifier(path.node.id)) return
      const name = path.node.id.name
      if (!isComponentName(name)) return

      const init = path.node.init
      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        onComponent({ name, path, line: path.node.loc?.start.line ?? 0 })
        return
      }

      // HOC / memo / forwardRef wrapping
      if (t.isCallExpression(init)) {
        const firstArg = (init as t.CallExpression).arguments[0]
        if (
          firstArg &&
          (t.isArrowFunctionExpression(firstArg) ||
            t.isFunctionExpression(firstArg) ||
            t.isIdentifier(firstArg))
        ) {
          onComponent({ name, path, line: path.node.loc?.start.line ?? 0 })
        }
      }
    },

    // export default function() {} — derive name from filename
    ExportDefaultDeclaration(path: any) {
      const decl = path.node.declaration
      const isAnonFn =
        (t.isFunctionDeclaration(decl) || t.isArrowFunctionExpression(decl)) &&
        !(decl as any).id
      if (!isAnonFn) return

      const base = filePath.split('/').pop() ?? filePath
      const name = base.replace(/\.[^.]+$/, '')
      if (!isComponentName(name)) return

      onComponent({ name, path, line: path.node.loc?.start.line ?? 0 })
    },
  })
}
