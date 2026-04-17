import { describe, expect, it } from 'vitest'
import { parseFile } from './parse-file.js'
import { REDUX_AMBIGUOUS_STORE_ID, createNodeId } from './symbol-id.js'

const FILE = 'src/App.tsx'

describe('parseFile', () => {
  it('creates stable component ids while keeping labels human-readable', () => {
    const { nodes } = parseFile(`function MyComponent() { return <div /> }`, FILE)
    expect(nodes).toEqual([
      expect.objectContaining({
        id: createNodeId('component', FILE, 'MyComponent'),
        label: 'MyComponent',
        type: 'component',
      }),
    ])
  })

  it('uses the default symbol key for anonymous default exports', () => {
    const { nodes } = parseFile(`export default function() { return <div /> }`, 'src/Button.tsx')
    expect(nodes).toEqual([
      expect.objectContaining({
        id: createNodeId('component', 'src/Button.tsx', 'default'),
        label: 'Button',
        type: 'component',
      }),
    ])
  })

  it('creates context nodes and edges with stable ids', () => {
    const code = `
      const ThemeContext = createContext(null)
      function ThemeProvider({ children }) {
        return <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>
      }
      function Button() {
        const theme = useContext(ThemeContext)
        return <button>{theme}</button>
      }
    `

    const { nodes, edges } = parseFile(code, FILE)
    const contextId = createNodeId('context', FILE, 'ThemeContext')
    const providerId = createNodeId('component', FILE, 'ThemeProvider')
    const buttonId = createNodeId('component', FILE, 'Button')

    expect(nodes).toContainEqual(expect.objectContaining({ id: contextId, label: 'ThemeContext', type: 'context' }))
    expect(nodes).toContainEqual(expect.objectContaining({
      id: providerId,
      isContextProvider: true,
      contextName: 'ThemeContext',
    }))
    expect(edges).toContainEqual(expect.objectContaining({
      source: providerId,
      target: contextId,
      type: 'context-provision',
    }))
    expect(edges).toContainEqual(expect.objectContaining({
      source: contextId,
      target: buttonId,
      type: 'context-subscription',
    }))
  })

  it('creates parent-child edges using stable component ids', () => {
    const code = `
      function Child() { return <span /> }
      function Parent() { return <Child /> }
    `

    const { edges } = parseFile(code, FILE)
    expect(edges).toContainEqual(expect.objectContaining({
      source: createNodeId('component', FILE, 'Parent'),
      target: createNodeId('component', FILE, 'Child'),
      type: 'parent-child',
    }))
  })

  it('connects Redux consumers to the single exact local store', () => {
    const code = `
      const appStore = configureStore({ reducer: rootReducer })
      function Counter() {
        const count = useSelector((s) => s.count)
        return <div>{count}</div>
      }
    `

    const { edges } = parseFile(code, FILE)
    expect(edges).toContainEqual(expect.objectContaining({
      source: createNodeId('store', FILE, 'appStore'),
      target: createNodeId('component', FILE, 'Counter'),
      type: 'store-subscription',
    }))
  })

  it('falls back to the shared ambiguous Redux store when the exact store is unknown', () => {
    const code = `
      function Counter() {
        const count = useSelector((s) => s.count)
        return <div>{count}</div>
      }
    `

    const { nodes, edges } = parseFile(code, FILE)
    expect(nodes).toContainEqual(expect.objectContaining({
      id: REDUX_AMBIGUOUS_STORE_ID,
      label: 'ReduxStore?',
      type: 'store',
      storeLibrary: 'redux',
    }))
    expect(edges).toContainEqual(expect.objectContaining({
      source: REDUX_AMBIGUOUS_STORE_ID,
      target: createNodeId('component', FILE, 'Counter'),
      type: 'store-subscription',
    }))
  })

  it('creates Zustand stores with stable ids keyed by the hook symbol', () => {
    const code = `
      const useCountStore = create(() => ({ count: 0 }))
      function Counter() {
        const count = useCountStore((s) => s.count)
        return <div>{count}</div>
      }
    `

    const { nodes, edges } = parseFile(code, FILE)
    expect(nodes).toContainEqual(expect.objectContaining({
      id: createNodeId('store', FILE, 'useCountStore'),
      label: 'CountStore',
      type: 'store',
      storeLibrary: 'zustand',
    }))
    expect(edges).toContainEqual(expect.objectContaining({
      source: createNodeId('store', FILE, 'useCountStore'),
      target: createNodeId('component', FILE, 'Counter'),
      type: 'store-subscription',
    }))
  })

  it('still detects class components', () => {
    const code = `
      class Counter extends React.Component {
        render() { return <div /> }
      }
    `

    const { nodes } = parseFile(code, FILE)
    expect(nodes).toContainEqual(expect.objectContaining({
      id: createNodeId('component', FILE, 'Counter'),
      label: 'Counter',
      type: 'component',
    }))
  })

  it('detects React namespace context APIs', () => {
    const code = `
      import * as React from 'react'
      const ThemeContext = React.createContext(null)
      function Button() {
        const theme = React.useContext(ThemeContext)
        return <button>{theme}</button>
      }
    `

    const { edges } = parseFile(code, FILE)
    expect(edges).toContainEqual(expect.objectContaining({
      source: createNodeId('context', FILE, 'ThemeContext'),
      target: createNodeId('component', FILE, 'Button'),
      type: 'context-subscription',
    }))
  })

  it('detects Redux aliases imported from react-redux and toolkit', () => {
    const code = `
      import { configureStore as makeStore } from '@reduxjs/toolkit'
      import { useSelector as useAppSelector } from 'react-redux'
      const appStore = makeStore({ reducer: rootReducer })
      function Counter() {
        const count = useAppSelector((s) => s.count)
        return <div>{count}</div>
      }
    `

    const { edges } = parseFile(code, FILE)
    expect(edges).toContainEqual(expect.objectContaining({
      source: createNodeId('store', FILE, 'appStore'),
      target: createNodeId('component', FILE, 'Counter'),
      type: 'store-subscription',
    }))
  })

  it('detects Zustand create aliases with generic curry syntax', () => {
    const code = `
      import { create as createStore } from 'zustand'
      const useCountStore = createStore<{ count: number }>()(() => ({ count: 0 }))
      function Counter() {
        const count = useCountStore((s) => s.count)
        return <div>{count}</div>
      }
    `

    const { nodes, edges } = parseFile(code, FILE)
    expect(nodes).toContainEqual(expect.objectContaining({
      id: createNodeId('store', FILE, 'useCountStore'),
      label: 'CountStore',
      type: 'store',
      storeLibrary: 'zustand',
    }))
    expect(edges).toContainEqual(expect.objectContaining({
      source: createNodeId('store', FILE, 'useCountStore'),
      target: createNodeId('component', FILE, 'Counter'),
      type: 'store-subscription',
    }))
  })
})
