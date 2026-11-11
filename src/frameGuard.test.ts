import { describe, expect, it } from 'vitest'
import { isFramed } from './frameGuard'

describe('isFramed', () => {
  it('is false in its own tab and true inside a frame', () => {
    const self = {}
    expect(isFramed({ top: self, self })).toBe(false)
    expect(isFramed({ top: {}, self })).toBe(true)
  })

  it('treats a parent that cannot be inspected as a frame', () => {
    const w = {
      self: {},
      get top(): unknown {
        throw new Error('blocked')
      },
    }
    expect(isFramed(w)).toBe(true)
  })
})
