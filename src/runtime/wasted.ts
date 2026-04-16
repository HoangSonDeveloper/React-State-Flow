/**
 * Wasted-render detection helpers.
 *
 * Kept in a pure module (no window/WebSocket access) so they can be unit-tested
 * in a Node environment without touching the DevTools hook bootstrap.
 */

/** Shallow-equal two plain objects. Returns true if all top-level values reference-equal. */
export function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/**
 * Detect whether a fiber's re-render was unnecessary.
 *   - On initial mount (`fiber.alternate === null`) we don't consider it wasted.
 *   - Wasted when props are shallow-equal AND memoizedState is reference-equal
 *     (hooks' linked-list head is reused across renders when no state changed).
 */
export function isWastedRender(fiber: any): boolean {
  const prev = fiber?.alternate
  if (!prev) return false
  const propsEqual = shallowEqual(fiber.memoizedProps, prev.memoizedProps)
  const stateEqual = fiber.memoizedState === prev.memoizedState
  return propsEqual && stateEqual
}
