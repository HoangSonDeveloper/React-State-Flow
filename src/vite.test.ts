import { describe, expect, it } from 'vitest'
import { reactStateFlowVitePlugin } from './vite.js'

describe('reactStateFlowVitePlugin', () => {
  it('injects runtime registration for named component bindings', async () => {
    const plugin = reactStateFlowVitePlugin()
    plugin.configResolved?.({ root: '/repo' } as any)

    const result = await plugin.transform?.(
      `import React from 'react'\nexport function Button() { return <button /> }\n`,
      '/repo/src/Button.tsx',
    )

    expect(result && typeof result !== 'string' ? result.code : result).toContain(
      `__rsfRegister(Button, { id: "component:src/Button.tsx#Button" })`,
    )
    expect(result && typeof result !== 'string' ? result.map : null).toBeTruthy()
  })

  it('rewrites anonymous default exports to register exact runtime ids', async () => {
    const plugin = reactStateFlowVitePlugin()
    plugin.configResolved?.({ root: '/repo' } as any)

    const result = await plugin.transform?.(
      `export default function() { return <div /> }\n`,
      '/repo/src/Button.tsx',
    )
    const code = result && typeof result !== 'string' ? result.code : result

    expect(code).toContain(`const __rsfDefaultComponent = __rsfRegister(function() { return <div /> }, { id: "component:src/Button.tsx#default" });`)
    expect(code).toContain('export default __rsfDefaultComponent')
  })

  it('is idempotent when transform receives already-instrumented code', async () => {
    const plugin = reactStateFlowVitePlugin()
    plugin.configResolved?.({ root: '/repo' } as any)

    const alreadyInstrumented = `
      import { registerComponent as __rsfRegister } from 'react-state-flow/runtime/register'
      export function Button() { return <button /> }
      __rsfRegister(Button, { id: "component:src/Button.tsx#Button" });
    `

    const result = await plugin.transform?.(alreadyInstrumented, '/repo/src/Button.tsx')
    expect(result).toBeNull()
  })
})
