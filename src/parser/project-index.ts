import { existsSync, readFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import type * as t from '@babel/types'
import { parse } from 'jsonc-parser'
import type { GraphNode } from './types.js'
import { REDUX_AMBIGUOUS_STORE_FILE, REDUX_AMBIGUOUS_STORE_ID, REDUX_AMBIGUOUS_STORE_LABEL } from './symbol-id.js'
import { normalizePath } from './path-utils.js'

export interface RawImportBinding {
  importedName: string
  source: string
}

export interface RawExportBinding {
  localName?: string
  source?: string
  importedName?: string
  anonymousDefault?: boolean
}

export interface RawModuleInfo {
  imports: Map<string, RawImportBinding>
  exports: Map<string, RawExportBinding>
  exportAllSources: string[]
}

export interface FilePassData {
  relPath: string
  moduleInfo: RawModuleInfo
  localSymbols: Map<string, GraphNode>
  anonymousDefaultSymbol?: GraphNode
  reduxStoreIds: string[]
}

interface PathAliasEntry {
  pattern: string
  replacements: string[]
}

interface TsConfigPaths {
  baseDir: string
  baseUrl?: string
  paths: PathAliasEntry[]
}

export interface ProjectIndex {
  readonly reduxStoreIds: string[]
  resolveImportedSymbol(filePath: string, localName: string): GraphNode | undefined
  resolveImportedMemberSymbol(filePath: string, namespaceName: string, memberName: string): GraphNode | undefined
  getSingleReduxStore(): GraphNode | undefined
  getAmbiguousReduxStore(): GraphNode
}

const MODULE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']

export function collectModuleInfo(ast: t.File): RawModuleInfo {
  const imports = new Map<string, RawImportBinding>()
  const exports = new Map<string, RawExportBinding>()
  const exportAllSources: string[] = []

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportSpecifier') {
          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value
          imports.set(specifier.local.name, { importedName, source: node.source.value })
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          imports.set(specifier.local.name, { importedName: 'default', source: node.source.value })
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          imports.set(specifier.local.name, { importedName: '*', source: node.source.value })
        }
      }
      continue
    }

    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'FunctionDeclaration' || node.declaration.type === 'ClassDeclaration') {
          const name = node.declaration.id?.name
          if (name) exports.set(name, { localName: name })
        } else if (node.declaration.type === 'VariableDeclaration') {
          for (const declaration of node.declaration.declarations) {
            if (declaration.id.type === 'Identifier') {
              exports.set(declaration.id.name, { localName: declaration.id.name })
            }
          }
        }
      }

      for (const specifier of node.specifiers) {
        if (specifier.type !== 'ExportSpecifier') continue
        const exportName = specifier.exported.type === 'Identifier'
          ? specifier.exported.name
          : specifier.exported.value
        const importedName = specifier.local.name

        if (node.source) {
          exports.set(exportName, {
            source: node.source.value,
            importedName,
          })
        } else {
          exports.set(exportName, { localName: importedName })
        }
      }
      continue
    }

    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration.type === 'Identifier') {
        exports.set('default', { localName: node.declaration.name })
      } else if (
        (node.declaration.type === 'FunctionDeclaration' || node.declaration.type === 'ClassDeclaration') &&
        node.declaration.id?.name
      ) {
        exports.set('default', { localName: node.declaration.id.name })
      } else {
        exports.set('default', { anonymousDefault: true })
      }
      continue
    }

    if (node.type === 'ExportAllDeclaration') {
      exportAllSources.push(node.source.value)
    }
  }

  return { imports, exports, exportAllSources }
}

export function buildProjectIndex(projectRoot: string, files: FilePassData[]): ProjectIndex {
  const filesByPath = new Map(files.map((file) => [file.relPath, file]))
  const fileSet = new Set(files.map((file) => file.relPath))
  const tsConfigPaths = loadTsConfigPaths(projectRoot)
  const resolutionCache = new Map<string, string | undefined>()
  const exportCache = new Map<string, GraphNode>()
  const missingExportCache = new Set<string>()
  const reduxStoreIds = files.flatMap((file) => file.reduxStoreIds)
  const nodeById = new Map<string, GraphNode>()
  for (const file of files) {
    for (const symbol of file.localSymbols.values()) {
      nodeById.set(symbol.id, symbol)
    }
    if (file.anonymousDefaultSymbol) {
      nodeById.set(file.anonymousDefaultSymbol.id, file.anonymousDefaultSymbol)
    }
  }
  const singleReduxStore = reduxStoreIds.length === 1 ? nodeById.get(reduxStoreIds[0]) : undefined

  function resolveImportTarget(filePath: string, specifier: string): string | undefined {
    const cacheKey = `${filePath}::${specifier}`
    if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey)

    const resolved = resolveModulePath(projectRoot, filePath, specifier, fileSet, tsConfigPaths)
    resolutionCache.set(cacheKey, resolved)
    return resolved
  }

  function resolveExport(
    filePath: string,
    exportName: string,
    seen = new Set<string>(),
  ): { node?: GraphNode; cacheable: boolean } {
    const cacheKey = `${filePath}::${exportName}`
    if (exportCache.has(cacheKey)) return { node: exportCache.get(cacheKey), cacheable: true }
    if (missingExportCache.has(cacheKey)) return { cacheable: true }
    if (seen.has(cacheKey)) return { cacheable: false }
    seen.add(cacheKey)

    try {
      const file = filesByPath.get(filePath)
      if (!file) return { cacheable: true }

      const binding = file.moduleInfo.exports.get(exportName)
      let resolved: GraphNode | undefined
      let cacheable = true

      if (binding?.localName) {
        resolved = file.localSymbols.get(binding.localName)
      } else if (binding?.anonymousDefault) {
        resolved = file.anonymousDefaultSymbol
      } else if (binding?.source && binding.importedName) {
        const targetFile = resolveImportTarget(filePath, binding.source)
        if (targetFile) {
          const result = resolveExport(targetFile, binding.importedName, seen)
          resolved = result.node
          cacheable = cacheable && result.cacheable
        }
      }

      if (!resolved) {
        for (const source of file.moduleInfo.exportAllSources) {
          const targetFile = resolveImportTarget(filePath, source)
          if (!targetFile) continue
          const result = resolveExport(targetFile, exportName, seen)
          resolved = result.node
          cacheable = cacheable && result.cacheable
          if (resolved) break
        }
      }

      if (resolved) {
        exportCache.set(cacheKey, resolved)
        return { node: resolved, cacheable: true }
      }

      if (cacheable) {
        missingExportCache.add(cacheKey)
      }

      return { cacheable }
    } finally {
      seen.delete(cacheKey)
    }
  }

  return {
    reduxStoreIds,
    resolveImportedSymbol(filePath, localName) {
      const file = filesByPath.get(filePath)
      const binding = file?.moduleInfo.imports.get(localName)
      if (!binding || binding.importedName === '*') return undefined

      const targetFile = resolveImportTarget(filePath, binding.source)
      if (!targetFile) return undefined
      return resolveExport(targetFile, binding.importedName).node
    },
    resolveImportedMemberSymbol(filePath, namespaceName, memberName) {
      const file = filesByPath.get(filePath)
      const binding = file?.moduleInfo.imports.get(namespaceName)
      if (!binding || binding.importedName !== '*') return undefined

      const targetFile = resolveImportTarget(filePath, binding.source)
      if (!targetFile) return undefined
      return resolveExport(targetFile, memberName).node
    },
    getSingleReduxStore() {
      return singleReduxStore
    },
    getAmbiguousReduxStore() {
      return {
        id: REDUX_AMBIGUOUS_STORE_ID,
        type: 'store',
        label: REDUX_AMBIGUOUS_STORE_LABEL,
        file: REDUX_AMBIGUOUS_STORE_FILE,
        line: 0,
        stateSlots: [],
        isContextProvider: false,
        storeLibrary: 'redux',
      }
    },
  }
}

function resolveModulePath(
  projectRoot: string,
  filePath: string,
  specifier: string,
  fileSet: ReadonlySet<string>,
  tsConfigPaths: TsConfigPaths | undefined,
): string | undefined {
  const fromDir = resolve(projectRoot, dirname(filePath))
  const candidates: string[] = []

  if (specifier.startsWith('.')) {
    candidates.push(resolve(fromDir, specifier))
  } else {
    candidates.push(...resolveAliasCandidates(specifier, tsConfigPaths))
  }

  for (const candidate of candidates) {
    for (const resolved of expandModuleCandidates(projectRoot, candidate)) {
      if (fileSet.has(resolved)) return resolved
    }
  }

  return undefined
}

function expandModuleCandidates(projectRoot: string, absoluteBase: string): string[] {
  const candidates: string[] = []
  const normalizedBase = normalizePath(relative(projectRoot, absoluteBase))

  candidates.push(normalizedBase)

  for (const ext of MODULE_EXTENSIONS) {
    candidates.push(normalizePath(relative(projectRoot, `${absoluteBase}${ext}`)))
    candidates.push(normalizePath(relative(projectRoot, join(absoluteBase, `index${ext}`))))
  }

  return candidates
}

function resolveAliasCandidates(specifier: string, tsConfigPaths: TsConfigPaths | undefined): string[] {
  if (!tsConfigPaths) return []

  const baseRoot = resolve(tsConfigPaths.baseDir, tsConfigPaths.baseUrl ?? '.')
  const candidates: string[] = []
  let matchedPathAlias = false

  for (const entry of tsConfigPaths.paths) {
    if (entry.pattern.includes('*')) {
      const [prefix, suffix] = entry.pattern.split('*')
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue

      matchedPathAlias = true
      const wildcardValue = specifier.slice(prefix.length, specifier.length - suffix.length)
      for (const replacement of entry.replacements) {
        candidates.push(resolve(baseRoot, replacement.replace('*', wildcardValue)))
      }
      continue
    }

    if (specifier === entry.pattern) {
      matchedPathAlias = true
      for (const replacement of entry.replacements) {
        candidates.push(resolve(baseRoot, replacement))
      }
    }
  }

  if (!matchedPathAlias) {
    candidates.push(resolve(baseRoot, specifier))
  }

  return candidates
}

function loadTsConfigPaths(projectRoot: string): TsConfigPaths | undefined {
  let current = resolve(projectRoot)

  while (true) {
    const candidate = join(current, 'tsconfig.json')
    if (existsSync(candidate)) {
      return parseTsConfigPaths(candidate)
    }

    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function parseTsConfigPaths(tsConfigPath: string): TsConfigPaths | undefined {
  try {
    const raw = readFileSync(tsConfigPath, 'utf-8')
    const parsed = parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const compilerOptions = parsed?.compilerOptions ?? {}
    const rawPaths = compilerOptions?.paths
    const paths: PathAliasEntry[] = []

    if (rawPaths && typeof rawPaths === 'object') {
      for (const [pattern, replacements] of Object.entries(rawPaths)) {
        if (!Array.isArray(replacements)) continue
        const validReplacements = replacements.filter((value): value is string => typeof value === 'string')
        if (validReplacements.length > 0) {
          paths.push({ pattern, replacements: validReplacements })
        }
      }
    }

    return {
      baseDir: dirname(tsConfigPath),
      baseUrl: typeof compilerOptions?.baseUrl === 'string' ? compilerOptions.baseUrl : undefined,
      paths,
    }
  } catch {
    return undefined
  }
}
