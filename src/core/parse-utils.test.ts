import { describe, expect, it } from 'vitest'
import { parseDate, parseMoney } from './parse-utils'

describe('parseDate', () => {
  it.each([
    ['5th Oct 2025', '2025-10-05'],
    ['05 Oct 26', '2026-10-05'],
    ['Oct 5, 2026', '2026-10-05'],
    ['05-Oct-2026', '2026-10-05'],
    ['23/09/2026', '2026-09-23'],
    ['2026-09-23', '2026-09-23'],
  ])('reads %s', (text, iso) => {
    expect(parseDate(text)).toBe(iso)
  })

  it('fills in a missing year from the statement period, across New Year', () => {
    const period = { from: '2025-12-15', to: '2026-01-14' }
    expect(parseDate('20 Dec', 'DMY', period)).toBe('2025-12-20')
    expect(parseDate('05 Jan', 'DMY', period)).toBe('2026-01-05')
    expect(parseDate('05/01', 'DMY', period)).toBe('2026-01-05')
    expect(parseDate('Jan 5', 'DMY', 2026)).toBe('2026-01-05')
  })

  it('needs a year from somewhere', () => {
    expect(parseDate('05 Jan')).toBeUndefined()
    expect(parseDate('Opening')).toBeUndefined()
  })
})

describe('parseMoney', () => {
  it.each([
    ['1,234.56CR', 1234.56],
    ['1,234.56 DR', -1234.56],
    ['−$5.00', -5],
    ['+$1,500.00', 1500],
    ['$1234.50', 1234.5],
    ['(12.00)', -12],
  ])('reads %s', (text, value) => {
    expect(parseMoney(text)).toBe(value)
  })
  it('ignores words', () => {
    expect(parseMoney('Oct')).toBeUndefined()
  })
})
