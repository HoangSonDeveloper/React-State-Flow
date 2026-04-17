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

      const registrations: Array<{ pos: number; text: string }> = []
      discoverComponents(ast, relPath, (component) => {
        if (!component.bindingName) return

        const pos = getRegistrationInsertPos(component.path)
        if (pos == null) return

        registrations.push({
          pos,
          text: `\n__rsfRegister(${component.bindingName}, { id: ${JSON.stringify(createNodeId('component', relPath, component.symbolKey))} });`,
        })
      })

      if (registrations.length === 0) return null

      const importInsertionPos = getImportInsertionPos(ast)
      let transformed = code
      const insertions = [
        ...registrations,
        {
          pos: importInsertionPos,
          text: `import { registerComponent as __rsfRegister } from 'react-state-flow/runtime/register'\n`,
        },
      ].sort((a, b) => b.pos - a.pos)

      for (const insertion of insertions) {
        transformed = transformed.slice(0, insertion.pos) + insertion.text + transformed.slice(insertion.pos)
      }

      return {
        code: transformed,
        map: null,
      }
    },
  }
}

function getImportInsertionPos(ast: Parameters<typeof discoverComponents>[0]): number {
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
