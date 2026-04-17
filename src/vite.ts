import type { File } from '@babel/types'
import { relative } from 'path'
import type { Plugin } from 'vite'
import { discoverComponents } from './parser/detectors/discover-components.js'
import { normalizePath } from './parser/path-utils.js'
import { parseSource } from './parser/parse-file.js'
import { createNodeId } from './parser/symbol-id.js'

export function reactStateFlowVitePlugin(): Plugin {
  let root = process.cwd()

  return {
    name: 'react-state-flow',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    transform(code, id) {
      const cleanId = id.split('?')[0]
      if (
        !/\.(tsx|ts|jsx|js)$/.test(cleanId) ||
        cleanId.includes('/node_modules/')
      ) {
        return null
      }

      const relPath = normalizePath(relative(root, cleanId))
      const ast = parseSource(code, relPath)
      if (!ast) return null

      const changes: Array<{ start: number; end: number; text: string }> = []
      discoverComponents(ast, relPath, (component) => {
        const componentId = createNodeId('component', relPath, component.symbolKey)

        if (!component.bindingName) {
          const replacement = createAnonymousDefaultRegistration(code, component.path, componentId)
          if (replacement) changes.push(replacement)
          return
        }

        const pos = getRegistrationInsertPos(component.path)
        if (pos == null) return

        changes.push({
          start: pos,
          end: pos,
          text: `\n__rsfRegister(${component.bindingName}, { id: ${JSON.stringify(componentId)} });`,
        })
      })

      if (changes.length === 0) return null

      const importInsertionPos = getImportInsertionPos(ast)
      let transformed = code
      const insertions = [
        ...changes,
        {
          start: importInsertionPos,
          end: importInsertionPos,
          text: `import { registerComponent as __rsfRegister } from 'react-state-flow/runtime/register'\n`,
        },
      ].sort((a, b) => b.start - a.start)

      for (const insertion of insertions) {
        transformed =
          transformed.slice(0, insertion.start) +
          insertion.text +
          transformed.slice(insertion.end)
      }

      return {
        code: transformed,
        map: null,
      }
    },
  }
}

function getImportInsertionPos(ast: File): number {
  const imports = ast.program.body.filter((node) => node.type === 'ImportDeclaration')
  if (imports.length === 0) return 0
  return imports[imports.length - 1].end ?? 0
}

function getRegistrationInsertPos(path: any): number | undefined {
  let targetPath = path

  if (targetPath.isVariableDeclarator?.()) {
    targetPath = targetPath.parentPath
  }

  if (targetPath.parentPath?.isExportNamedDeclaration?.() || targetPath.parentPath?.isExportDefaultDeclaration?.()) {
    targetPath = targetPath.parentPath
  }

  return targetPath.node?.end
}

function createAnonymousDefaultRegistration(
  code: string,
  path: any,
  componentId: string,
): { start: number; end: number; text: string } | null {
  if (!path.isExportDefaultDeclaration?.()) return null

  const declaration = path.node.declaration
  const start = path.node.start
  const end = path.node.end
  const declarationStart = declaration?.start
  const declarationEnd = declaration?.end
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    typeof declarationStart !== 'number' ||
    typeof declarationEnd !== 'number'
  ) {
    return null
  }

  const declarationSource = code.slice(declarationStart, declarationEnd)
  const defaultBinding = '__rsfDefaultComponent'
  return {
    start,
    end,
    text:
      `const ${defaultBinding} = __rsfRegister(${declarationSource}, { id: ${JSON.stringify(componentId)} });\n` +
      `export default ${defaultBinding}`,
  }
}
