const COMPONENT_ID_SYMBOL = Symbol.for('react-state-flow.component-id')
const componentIdRegistry = new WeakMap<object, string>()

export interface RegisteredComponentMeta {
  id: string
}

export function registerComponent<T>(component: T, meta: RegisteredComponentMeta): T {
  if (!component || (typeof component !== 'function' && typeof component !== 'object')) {
    return component
  }

  try {
    Object.defineProperty(component, COMPONENT_ID_SYMBOL, {
      value: meta.id,
      configurable: true,
    })
  } catch {
    // Some wrapped component objects can be frozen. Fall back to WeakMap only.
  }

  componentIdRegistry.set(component as object, meta.id)
  return component
}

export function getRegisteredComponentId(component: unknown): string | undefined {
  if (!component || (typeof component !== 'function' && typeof component !== 'object')) {
    return undefined
  }

  return (component as Record<PropertyKey, string | undefined>)[COMPONENT_ID_SYMBOL]
    ?? componentIdRegistry.get(component as object)
}
