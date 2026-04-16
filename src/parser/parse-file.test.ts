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
// 5. Error handling
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
