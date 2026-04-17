import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { parseProject } from './index.js'
import { createNodeId } from './symbol-id.js'

function createProject(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'react-state-flow-'))
  for (const [filePath, content] of Object.entries(files)) {
    const absPath = join(root, filePath)
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, content)
  }
  return root
}

describe('parseProject', () => {
  it('keeps duplicate component names as separate nodes and resolves imports by file', () => {
    const root = createProject({
      'src/a/Button.tsx': `export function Button() { return <div /> }`,
      'src/b/Button.tsx': `export function Button() { return <span /> }`,
      'src/Page.tsx': `
        import { Button } from './b/Button'
        export function Page() {
          return <Button />
        }
      `,
    })

    const graph = parseProject(join(root, 'src'))
    expect(graph.nodes.filter((node) => node.label === 'Button')).toHaveLength(2)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: createNodeId('component', 'Page.tsx', 'Page'),
      target: createNodeId('component', 'b/Button.tsx', 'Button'),
      type: 'parent-child',
    }))
  })

  it('resolves named import aliases to the exported component id', () => {
    const root = createProject({
      'src/Button.tsx': `export function Button() { return <button /> }`,
      'src/Page.tsx': `
        import { Button as MainButton } from './Button'
        export function Page() {
          return <MainButton />
        }
      `,
    })

    const graph = parseProject(join(root, 'src'))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: createNodeId('component', 'Page.tsx', 'Page'),
      target: createNodeId('component', 'Button.tsx', 'Button'),
      type: 'parent-child',
    }))
  })

  it('resolves default imports for anonymous default-exported components', () => {
    const root = createProject({
      'src/Header.tsx': `export default function() { return <header /> }`,
      'src/Page.tsx': `
        import Header from './Header'
        export function Page() {
          return <Header />
        }
      `,
    })

    const graph = parseProject(join(root, 'src'))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: createNodeId('component', 'Page.tsx', 'Page'),
      target: createNodeId('component', 'Header.tsx', 'default'),
      type: 'parent-child',
    }))
  })

  it('resolves tsconfig path aliases when they point back into the scanned project', () => {
    const root = createProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@components/*': ['src/components/*'],
          },
        },
      }),
      'src/components/Button.tsx': `export function Button() { return <button /> }`,
      'src/Page.tsx': `
        import { Button } from '@components/Button'
        export function Page() {
          return <Button />
        }
      `,
    })

    const graph = parseProject(join(root, 'src'))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: createNodeId('component', 'Page.tsx', 'Page'),
      target: createNodeId('component', 'components/Button.tsx', 'Button'),
      type: 'parent-child',
    }))
  })

  it('resolves duplicate context names through the imported file, not the label', () => {
    const root = createProject({
      'src/contexts/a.tsx': `export const ThemeContext = createContext(null)`,
      'src/contexts/b.tsx': `export const ThemeContext = createContext(null)`,
      'src/Page.tsx': `
        import { ThemeContext } from './contexts/b'
        export function Page() {
          const theme = useContext(ThemeContext)
          return <div>{theme}</div>
        }
      `,
    })

    const graph = parseProject(join(root, 'src'))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: createNodeId('context', 'contexts/b.tsx', 'ThemeContext'),
      target: createNodeId('component', 'Page.tsx', 'Page'),
      type: 'context-subscription',
    }))
  })

  it('resolves duplicate Zustand hook names through imports and keeps store ids distinct', () => {
    const root = createProject({
      'src/stores/a.ts': `export const useUiStore = create(() => ({ open: true }))`,
      'src/stores/b.ts': `export const useUiStore = create(() => ({ open: false }))`,
      'src/Page.tsx': `
        import { useUiStore } from './stores/b'
        export function Page() {
          const open = useUiStore((s) => s.open)
          return <div>{String(open)}</div>
        }
      `,
    })

    const graph = parseProject(join(root, 'src'))
    expect(graph.nodes.filter((node) => node.label === 'UiStore')).toHaveLength(2)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: createNodeId('store', 'stores/b.ts', 'useUiStore'),
      target: createNodeId('component', 'Page.tsx', 'Page'),
      type: 'store-subscription',
    }))
  })
})
