import { describe, expect, it } from 'vitest'
import { collectCommitRenderEvents, didFiberRender } from './collect-events.js'

describe('didFiberRender', () => {
  it('returns true for newly mounted fibers', () => {
    expect(didFiberRender({ alternate: null })).toBe(true)
  })

  it('returns false for bailed-out fibers with identical memoized references', () => {
    const sharedProps = { count: 1 }
    const sharedState = { hook: 1 }
    const sharedDependencies = { firstContext: null }
    const sharedQueue = { pending: null }

    expect(didFiberRender({
      memoizedProps: sharedProps,
      memoizedState: sharedState,
      dependencies: sharedDependencies,
      updateQueue: sharedQueue,
      ref: null,
      alternate: {
        memoizedProps: sharedProps,
        memoizedState: sharedState,
        dependencies: sharedDependencies,
        updateQueue: sharedQueue,
        ref: null,
      },
    })).toBe(false)
  })

  it('returns true when memoized props changed between alternates', () => {
    expect(didFiberRender({
      memoizedProps: { count: 2 },
      memoizedState: null,
      alternate: {
        memoizedProps: { count: 1 },
        memoizedState: null,
      },
    })).toBe(true)
  })
})

describe('collectCommitRenderEvents', () => {
  it('emits events only for fibers that rendered in the current commit', () => {
    const sharedChildProps = { value: 1 }
    const sharedChildState = { hook: 1 }
    const sharedChildQueue = { pending: null }
    const sharedChildDeps = { firstContext: null }
    const childFiber = {
      type: { displayName: 'Child' },
      memoizedProps: sharedChildProps,
      memoizedState: sharedChildState,
      updateQueue: sharedChildQueue,
      dependencies: sharedChildDeps,
      alternate: {
        memoizedProps: sharedChildProps,
        memoizedState: sharedChildState,
        updateQueue: sharedChildQueue,
        dependencies: sharedChildDeps,
      },
    }
    const parentFiber = {
      type: { displayName: 'Parent' },
      memoizedProps: { value: 2 },
      memoizedState: { hook: 2 },
      alternate: {
        memoizedProps: { value: 1 },
        memoizedState: { hook: 1 },
      },
      child: childFiber,
    }

    const counts = new Map<string, number>()
    const events = collectCommitRenderEvents({
      rootFiber: parentFiber,
      getFiberName: (fiber) => fiber?.type?.displayName ?? null,
      getFiberComponentId: (fiber) => fiber?.type?.displayName?.toLowerCase(),
      incrementRenderCount(identity) {
        const next = (counts.get(identity) ?? 0) + 1
        counts.set(identity, next)
        return next
      },
      isWastedRender: () => false,
      now: () => 123,
    })

    expect(events).toEqual([
      {
        type: 'render',
        componentName: 'Parent',
        componentId: 'parent',
        renderCount: 1,
        timestamp: 123,
        isWasted: false,
      },
    ])
  })
})
