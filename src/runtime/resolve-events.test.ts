import { describe, expect, it } from 'vitest'
import { buildRuntimeGraphIndex, resolveRuntimeRenderEvent } from './resolve-events.js'

const graph = {
  projectRoot: '/tmp/project',
  nodes: [
    {
      id: 'component:a#Button',
      type: 'component' as const,
      label: 'Button',
      file: 'a.tsx',
      line: 1,
      stateSlots: [],
      isContextProvider: false,
    },
    {
      id: 'component:b#Button',
      type: 'component' as const,
      label: 'Button',
      file: 'b.tsx',
      line: 1,
      stateSlots: [],
      isContextProvider: false,
    },
    {
      id: 'component:c#Card',
      type: 'component' as const,
      label: 'Card',
      file: 'c.tsx',
      line: 1,
      stateSlots: [],
      isContextProvider: false,
    },
  ],
  edges: [],
}

describe('resolveRuntimeRenderEvent', () => {
  it('preserves explicit component ids from the runtime', () => {
    const index = buildRuntimeGraphIndex(graph)
    const event = resolveRuntimeRenderEvent({
      type: 'render',
      componentName: 'Button',
      componentId: 'component:exact#Button',
      renderCount: 1,
      timestamp: 1,
    }, index)

    expect(event.componentId).toBe('component:exact#Button')
  })

  it('fills in the unique component id when the name is unambiguous', () => {
    const index = buildRuntimeGraphIndex(graph)
    const event = resolveRuntimeRenderEvent({
      type: 'render',
      componentName: 'Card',
      renderCount: 1,
      timestamp: 1,
    }, index)

    expect(event.componentId).toBe('component:c#Card')
  })

  it('keeps ambiguous duplicate names unresolved', () => {
    const index = buildRuntimeGraphIndex(graph)
    const event = resolveRuntimeRenderEvent({
      type: 'render',
      componentName: 'Button',
      renderCount: 1,
      timestamp: 1,
    }, index)

    expect(event.componentId).toBeUndefined()
    expect(index.duplicateComponentLabels).toEqual(['Button'])
  })
})
