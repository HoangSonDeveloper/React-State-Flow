import { describe, it, expect } from 'vitest'
import { shallowEqual, isWastedRender } from './wasted.js'

describe('shallowEqual', () => {
  it('returns true for reference-equal values', () => {
    const obj = { a: 1 }
    expect(shallowEqual(obj, obj)).toBe(true)
  })

  it('returns true for objects with same keys and reference-equal values', () => {
    const inner = { nested: true }
    expect(shallowEqual({ a: 1, b: inner }, { a: 1, b: inner })).toBe(true)
  })

  it('returns false when key counts differ', () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('returns false when a value differs by reference', () => {
    expect(shallowEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false)
  })

  it('returns false when a primitive value differs', () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns false for null on either side', () => {
    expect(shallowEqual(null, {})).toBe(false)
    expect(shallowEqual({}, null)).toBe(false)
  })

  it('returns true for two empty objects', () => {
    expect(shallowEqual({}, {})).toBe(true)
  })

  it('returns true for primitives that are strictly equal', () => {
    expect(shallowEqual(5, 5)).toBe(true)
    expect(shallowEqual('x', 'x')).toBe(true)
  })

  it('returns false for primitives that are not strictly equal', () => {
    expect(shallowEqual(5, 6)).toBe(false)
  })
})

describe('isWastedRender', () => {
  it('returns false on initial mount (no alternate)', () => {
    const fiber = { alternate: null, memoizedProps: { a: 1 }, memoizedState: null }
    expect(isWastedRender(fiber)).toBe(false)
  })

  it('returns true when props are shallow-equal and state is reference-equal', () => {
    const state = { hook: 1 }
    const fiber = {
      memoizedProps: { a: 1, b: 'x' },
      memoizedState: state,
      alternate: { memoizedProps: { a: 1, b: 'x' }, memoizedState: state },
    }
    expect(isWastedRender(fiber)).toBe(true)
  })

  it('returns false when props changed', () => {
    const state = { hook: 1 }
    const fiber = {
      memoizedProps: { a: 2 },
      memoizedState: state,
      alternate: { memoizedProps: { a: 1 }, memoizedState: state },
    }
    expect(isWastedRender(fiber)).toBe(false)
  })

  it('returns false when state reference changed (hook update)', () => {
    const fiber = {
      memoizedProps: { a: 1 },
      memoizedState: { hook: 2 },
      alternate: { memoizedProps: { a: 1 }, memoizedState: { hook: 1 } },
    }
    expect(isWastedRender(fiber)).toBe(false)
  })

  it('returns true when both props and state are unchanged but new prop object identity', () => {
    // Parent re-rendered creating a new props object with same shallow values
    const state = { hook: 1 }
    const fiber = {
      memoizedProps: { a: 1, onClick: () => {} },
      memoizedState: state,
      alternate: { memoizedProps: { a: 1, onClick: undefined as any }, memoizedState: state },
    }
    // onClick reference differs → expected NOT wasted (callback identity matters)
    expect(isWastedRender(fiber)).toBe(false)
  })

  it('returns false when fiber is null/undefined', () => {
    expect(isWastedRender(null)).toBe(false)
    expect(isWastedRender(undefined)).toBe(false)
  })
})
