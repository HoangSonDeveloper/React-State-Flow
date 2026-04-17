import { describe, expect, it } from 'vitest'
import { getRegisteredComponentId, registerComponent } from './registry.js'

describe('registerComponent', () => {
  it('registers and resolves ids for mutable components', () => {
    function Button() {
      return null
    }

    const registered = registerComponent(Button, { id: 'component:Button' })
    expect(registered).toBe(Button)
    expect(getRegisteredComponentId(Button)).toBe('component:Button')
  })

  it('falls back to the WeakMap registry for frozen component objects', () => {
    const component = Object.freeze({
      render() {
        return null
      },
    })

    registerComponent(component, { id: 'component:Frozen' })
    expect(getRegisteredComponentId(component)).toBe('component:Frozen')
  })
})
