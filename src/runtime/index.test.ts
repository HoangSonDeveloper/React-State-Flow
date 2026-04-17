import { describe, expect, it } from 'vitest'

describe('runtime bootstrap', () => {
  it('is safe to import without window during SSR / Node evaluation', async () => {
    await expect(import('./index.js')).resolves.toBeTruthy()
  })
})
