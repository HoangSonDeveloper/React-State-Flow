import { describe, it, expect, vi } from 'vitest'
import { parseFile } from './parse-file.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILE = 'src/App.tsx'

// ---------------------------------------------------------------------------
// 1. Component detection
// ---------------------------------------------------------------------------

describe('component detection', () => {
  it('detects function declaration', () => {
    const code = `function MyComponent() { return <div /> }`
    const { nodes } = parseFile(code, FILE)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ id: 'MyComponent', type: 'component', label: 'MyComponent' })
  })

  it('detects arrow function', () => {
    const code = `const MyComponent = () => <div />`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0]).toMatchObject({ id: 'MyComponent', type: 'component' })
  })

  it('detects function expression', () => {
    const code = `const MyComponent = function() { return <div /> }`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0]).toMatchObject({ id: 'MyComponent', type: 'component' })
  })

  it('detects HOC-wrapped component (memo)', () => {
    const code = `const MyComponent = memo(() => <div />)`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0]).toMatchObject({ id: 'MyComponent', type: 'component' })
  })

  it('detects HOC-wrapped component (forwardRef)', () => {
    const code = `const MyInput = forwardRef((props, ref) => <input ref={ref} />)`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0]).toMatchObject({ id: 'MyInput', type: 'component' })
  })

  it('ignores lowercase function (not a component)', () => {
    const code = `function helper() { return null }`
    const { nodes } = parseFile(code, FILE)
    expect(nodes).toHaveLength(0)
  })

  it('derives component name from filename for anonymous export default', () => {
    const code = `export default function() { return <div /> }`
    const { nodes } = parseFile(code, 'src/Button.tsx')
    expect(nodes[0]).toMatchObject({ id: 'Button', type: 'component' })
  })

  it('ignores anonymous export default when filename starts lowercase', () => {
    const code = `export default function() { return <div /> }`
    const { nodes } = parseFile(code, 'src/utils.ts')
    expect(nodes).toHaveLength(0)
  })

  it('stores correct file and line info', () => {
    const code = `function MyComponent() { return <div /> }`
    const { nodes } = parseFile(code, 'src/MyComponent.tsx')
    expect(nodes[0].file).toBe('src/MyComponent.tsx')
    expect(nodes[0].line).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 2. State slots
// ---------------------------------------------------------------------------

describe('state slots', () => {
  it('extracts useState variable name', () => {
    const code = `
      function Counter() {
        const [count, setCount] = useState(0)
        return <div>{count}</div>
      }
    `
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0].stateSlots).toEqual(['count'])
  })

  it('extracts useReducer variable name', () => {
    const code = `
      function Form() {
        const [state, dispatch] = useReducer(reducer, {})
        return <div />
      }
    `
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0].stateSlots).toEqual(['state'])
  })

  it('extracts multiple state slots', () => {
    const code = `
      function MyForm() {
        const [name, setName] = useState('')
        const [age, setAge] = useState(0)
        return <div />
      }
    `
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0].stateSlots).toEqual(['name', 'age'])
  })

  it('returns empty stateSlots when no hooks', () => {
    const code = `function Pure() { return <div /> }`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0].stateSlots).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3. Context
// ---------------------------------------------------------------------------

describe('context', () => {
  it('creates a context node for createContext call', () => {
    const code = `const ThemeContext = createContext(null)`
    const { nodes } = parseFile(code, FILE)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ id: 'ThemeContext', type: 'context' })
  })

  it('creates context-subscription edge for useContext', () => {
    const code = `
      const ThemeContext = createContext(null)
      function Button() {
        const theme = useContext(ThemeContext)
        return <button />
      }
    `
    const { edges } = parseFile(code, FILE)
    const sub = edges.find((e) => e.type === 'context-subscription')
    expect(sub).toMatchObject({ source: 'ThemeContext', target: 'Button' })
  })

  it('marks component as context provider when rendering <XxxContext.Provider>', () => {
    const code = `
      const ThemeContext = createContext(null)
      function ThemeProvider({ children }) {
        return <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>
      }
    `
    const { nodes } = parseFile(code, FILE)
    const provider = nodes.find((n) => n.id === 'ThemeProvider')
    expect(provider?.isContextProvider).toBe(true)
    expect(provider?.contextName).toBe('ThemeContext')
  })

  it('creates context-provision edge for provider component', () => {
    const code = `
      const ThemeContext = createContext(null)
      function ThemeProvider({ children }) {
        return <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>
      }
    `
    const { edges } = parseFile(code, FILE)
    const provision = edges.find((e) => e.type === 'context-provision')
    expect(provision).toMatchObject({ source: 'ThemeProvider', target: 'ThemeContext' })
  })

  it('sets isContextProvider false for regular component', () => {
    const code = `function Button() { return <button /> }`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0].isContextProvider).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. JSX parent-child edges
// ---------------------------------------------------------------------------

describe('JSX parent-child edges', () => {
  it('creates parent-child edge when parent renders known child', () => {
    const code = `
      function Child() { return <span /> }
      function Parent() { return <Child /> }
    `
    const { edges } = parseFile(code, FILE)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'Parent', target: 'Child', type: 'parent-child' })
  })

  it('does not create edge for unknown component', () => {
    const code = `
      function Parent() { return <UnknownComponent /> }
    `
    const { edges } = parseFile(code, FILE)
    expect(edges).toHaveLength(0)
  })

  it('deduplicates edges when same child rendered multiple times', () => {
    const code = `
      function Item() { return <li /> }
      function List() {
        return <div><Item /><Item /><Item /></div>
      }
    `
    const { edges } = parseFile(code, FILE)
    const parentChild = edges.filter((e) => e.type === 'parent-child')
    expect(parentChild).toHaveLength(1)
  })

  it('creates edge for cross-file component via externalComponents', () => {
    const code = `
      function Page() { return <Header /> }
    `
    const external = new Set(['Header'])
    const { edges } = parseFile(code, FILE, external)
    expect(edges[0]).toMatchObject({ source: 'Page', target: 'Header', type: 'parent-child' })
  })

  it('handles multiple children', () => {
    const code = `
      function Nav() { return <nav /> }
      function Footer() { return <footer /> }
      function Layout() { return <div><Nav /><Footer /></div> }
    `
    const { edges } = parseFile(code, FILE)
    const ids = edges.map((e) => e.id)
    expect(ids).toContain('Layout->Nav')
    expect(ids).toContain('Layout->Footer')
  })
})

// ---------------------------------------------------------------------------
// 5. Redux
// ---------------------------------------------------------------------------

describe('redux', () => {
  it('creates ReduxStore node for configureStore', () => {
    const code = `const store = configureStore({ reducer: rootReducer })`
    const { nodes } = parseFile(code, FILE)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      id: 'ReduxStore',
      type: 'store',
      storeLibrary: 'redux',
    })
  })

  it('creates ReduxStore node for createStore', () => {
    const code = `const store = createStore(rootReducer)`
    const { nodes } = parseFile(code, FILE)
    expect(nodes[0]).toMatchObject({
      id: 'ReduxStore',
      type: 'store',
      storeLibrary: 'redux',
    })
  })

  it('creates store-subscription edge for useSelector', () => {
    const code = `
      function Counter() {
        const count = useSelector((s) => s.count)
        return <div>{count}</div>
      }
    `
    const { edges } = parseFile(code, FILE)
    const sub = edges.find((e) => e.type === 'store-subscription')
    expect(sub).toMatchObject({ source: 'ReduxStore', target: 'Counter' })
  })

  it('creates store-subscription edge for useDispatch', () => {
    const code = `
      function Button() {
        const dispatch = useDispatch()
        return <button />
      }
    `
    const { edges } = parseFile(code, FILE)
    const sub = edges.find((e) => e.type === 'store-subscription')
    expect(sub).toMatchObject({ source: 'ReduxStore', target: 'Button' })
  })

  it('deduplicates store-subscription when component uses both useSelector and useDispatch', () => {
    const code = `
      function Counter() {
        const count = useSelector((s) => s.count)
        const dispatch = useDispatch()
        return <div>{count}</div>
      }
    `
    const { edges } = parseFile(code, FILE)
    const subs = edges.filter((e) => e.type === 'store-subscription')
    expect(subs).toHaveLength(1)
  })

  it('does not create subscription edge when component uses no redux hooks', () => {
    const code = `function Plain() { return <div /> }`
    const { edges } = parseFile(code, FILE)
    expect(edges.filter((e) => e.type === 'store-subscription')).toHaveLength(0)
  })

  it('auto-creates virtual ReduxStore node when hooks used without store declaration', () => {
    const code = `
      function Counter() {
        const count = useSelector((s) => s.count)
        return <div>{count}</div>
      }
    `
    const { nodes } = parseFile(code, FILE)
    const storeNode = nodes.find((n) => n.id === 'ReduxStore')
    expect(storeNode).toMatchObject({ type: 'store', storeLibrary: 'redux' })
  })
})

// ---------------------------------------------------------------------------
// 6. Zustand
// ---------------------------------------------------------------------------

describe('zustand', () => {
  it('creates store node from create() call, stripping use prefix', () => {
    const code = `const useCountStore = create(() => ({ count: 0 }))`
    const { nodes } = parseFile(code, FILE)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      id: 'CountStore',
      type: 'store',
      storeLibrary: 'zustand',
    })
  })

  it('creates store-subscription edge when component calls store hook', () => {
    const code = `
      const useCountStore = create(() => ({ count: 0 }))
      function Counter() {
        const count = useCountStore((s) => s.count)
        return <div>{count}</div>
      }
    `
    const { edges } = parseFile(code, FILE)
    const sub = edges.find((e) => e.type === 'store-subscription')
    expect(sub).toMatchObject({ source: 'CountStore', target: 'Counter' })
  })

  it('creates separate nodes for multiple stores', () => {
    const code = `
      const useCountStore = create(() => ({ count: 0 }))
      const useUserStore = create(() => ({ name: '' }))
    `
    const { nodes } = parseFile(code, FILE)
    const ids = nodes.map((n) => n.id).sort()
    expect(ids).toEqual(['CountStore', 'UserStore'])
  })

  it('creates edges to multiple stores from the same component', () => {
    const code = `
      const useCountStore = create(() => ({ count: 0 }))
      const useUserStore = create(() => ({ name: '' }))
      function Dashboard() {
        const count = useCountStore((s) => s.count)
        const name = useUserStore((s) => s.name)
        return <div />
      }
    `
    const { edges } = parseFile(code, FILE)
    const subs = edges.filter((e) => e.type === 'store-subscription')
    const sources = subs.map((e) => e.source).sort()
    expect(sources).toEqual(['CountStore', 'UserStore'])
  })

  it('does not create edge when component does not call store hook', () => {
    const code = `
      const useCountStore = create(() => ({ count: 0 }))
      function Plain() { return <div /> }
    `
    const { edges } = parseFile(code, FILE)
    expect(edges.filter((e) => e.type === 'store-subscription')).toHaveLength(0)
  })

  it('ignores create() call not assigned to a use-prefixed name', () => {
    const code = `const store = create(() => ({ count: 0 }))`
    const { nodes } = parseFile(code, FILE)
    expect(nodes).toHaveLength(0)
  })

  it('creates edge for cross-file store hook via shared registry', () => {
    const globalStores = new Map<string, string>()
    // File A declares the store.
    parseFile(
      `const useUiStore = create(() => ({ open: true }))`,
      'src/store/useUiStore.ts',
      undefined,
      globalStores,
    )
    // File B consumes the hook — no declaration in scope.
    const { edges } = parseFile(
      `function Sidebar() {
         const open = useUiStore((s) => s.open)
         return <aside />
       }`,
      'src/Sidebar.tsx',
      undefined,
      globalStores,
    )
    const sub = edges.find((e) => e.type === 'store-subscription')
    expect(sub).toMatchObject({ source: 'UiStore', target: 'Sidebar' })
  })
})

// ---------------------------------------------------------------------------
// 7. Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('returns empty result and does not throw on invalid code', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { nodes, edges } = parseFile('this is not valid JS !!@#$', FILE)
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
    consoleSpy.mockRestore()
  })

  it('logs a warning on parse failure', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseFile('??? invalid ???', FILE)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[RSF]'))
    consoleSpy.mockRestore()
  })
})
