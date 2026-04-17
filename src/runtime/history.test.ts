import { describe, expect, it } from 'vitest'
import { buildRuntimeHistorySnapshot } from './history.js'

describe('buildRuntimeHistorySnapshot', () => {
  it('rebuilds both render counts and wasted counts from history', () => {
    const snapshot = buildRuntimeHistorySnapshot([
      { type: 'render', componentName: 'Button', componentId: 'component:a#Button', renderCount: 1, timestamp: 1 },
      { type: 'render', componentName: 'Button', componentId: 'component:a#Button', renderCount: 2, timestamp: 2, isWasted: true },
      { type: 'render', componentName: 'Card', componentId: 'component:b#Card', renderCount: 5, timestamp: 3, isWasted: true },
    ])

    expect(snapshot).toEqual({
      renderCounts: {
        'component:a#Button': 2,
        'component:b#Card': 5,
      },
      wastedCounts: {
        'component:a#Button': 1,
        'component:b#Card': 1,
      },
    })
  })

  it('ignores ambiguous history events that do not carry a componentId', () => {
    const snapshot = buildRuntimeHistorySnapshot([
      { type: 'render', componentName: 'Button', renderCount: 3, timestamp: 1 },
    ])

    expect(snapshot).toEqual({ renderCounts: {}, wastedCounts: {} })
  })
})
