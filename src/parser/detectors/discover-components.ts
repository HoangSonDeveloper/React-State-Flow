import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import type { ComponentInfo } from './types.js'

const traverse = (_traverse as any).default ?? _traverse

export function isComponentName(name: string): boolean {
  // Must start with an uppercase letter (PascalCase).
  if (!/^[A-Z]/.test(name)) return false
  // Exclude SCREAMING_SNAKE_CASE constants like MAX_RETRIES, API_URL.
  if (/^[A-Z0-9_]+$/.test(name)) return false
  return true
}

/**
 * Returns true if `superClass` references React's Component or PureComponent
 * (either bare or member-accessed via `React`).
 */
export function isReactComponentSuper(sup: t.Node | null | undefined): boolean {
  if (!sup) return false
  if (t.isIdentifier(sup) && (sup.name === 'Component' || sup.name === 'PureComponent')) {
    return true
  }
  if (
    t.isMemberExpression(sup) &&
    t.isIdentifier(sup.object, { name: 'React' }) &&
    t.isIdentifier(sup.property) &&
    (sup.property.name === 'Component' || sup.property.name === 'PureComponent')
  ) {
    return true
  }
  return false
}

/**
 * Walks the AST and invokes `onComponent` for each React component it finds.
 * Handles: function declarations, arrow/function expressions, HOC/memo/forwardRef wrapping,
 * anonymous default exports (name derived from file path), and class components
 * extending React.Component / React.PureComponent.
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

    ClassDeclaration(path: any) {
      const name = path.node.id?.name
      if (!name || !isComponentName(name)) return
      if (!isReactComponentSuper(path.node.superClass)) return
      onComponent({ name, path, line: path.node.loc?.start.line ?? 0 })
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
