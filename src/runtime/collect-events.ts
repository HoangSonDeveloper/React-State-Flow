export interface CommitRenderEvent {
  type: 'render'
  componentName: string
  componentId?: string
  renderCount: number
  timestamp: number
  isWasted?: boolean
}

interface CommitEventOptions {
  rootFiber: any
  getFiberName(fiber: any): string | null
  getFiberComponentId(fiber: any): string | undefined
  incrementRenderCount(identity: string): number
  isWastedRender(fiber: any): boolean
  now(): number
}

export function collectCommitRenderEvents({
  rootFiber,
  getFiberName,
  getFiberComponentId,
  incrementRenderCount,
  isWastedRender,
  now,
}: CommitEventOptions): CommitRenderEvent[] {
  const events: CommitRenderEvent[] = []
  const seenInCommit = new Set<string>()
  const stack: any[] = [rootFiber]

  while (stack.length > 0) {
    const fiber = stack.pop()
    if (!fiber) continue

    const componentName = getFiberName(fiber)
    const componentId = getFiberComponentId(fiber)
    const identity = componentId ?? componentName ?? null

    if (
      componentName &&
      /^[A-Z]/.test(componentName) &&
      identity &&
      !seenInCommit.has(identity) &&
      didFiberRender(fiber)
    ) {
      seenInCommit.add(identity)
      events.push({
        type: 'render',
        componentName,
        componentId,
        renderCount: incrementRenderCount(identity),
        timestamp: now(),
        isWasted: isWastedRender(fiber),
      })
    }

    if (fiber.sibling) stack.push(fiber.sibling)
    if (fiber.child) stack.push(fiber.child)
  }

  return events
}

export function didFiberRender(fiber: any): boolean {
  if (!fiber) return false

  const prev = fiber.alternate
  if (!prev) return true

  return (
    fiber.memoizedProps !== prev.memoizedProps ||
    fiber.memoizedState !== prev.memoizedState ||
    fiber.dependencies !== prev.dependencies ||
    fiber.updateQueue !== prev.updateQueue ||
    fiber.ref !== prev.ref
  )
}
