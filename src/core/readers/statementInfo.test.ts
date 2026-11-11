import { describe, expect, it } from 'vitest'
import { detectAccountSuffix, detectBank, detectPeriod, detectTotals, latestYear } from './statementInfo'

describe('detectBank', () => {
  it('trusts the page header and footer over bank names inside transactions', () => {
    expect(detectBank(['Copyright © 2026 Westpac Banking Corporation'], 'CASH ADVANCE ANZ BANKING GROUP')).toBe('Westpac')
    expect(detectBank(['Commonwealth Bank of Australia ABN 00 000 000 000'], 'Transfer To Westpac Card')).toBe('CommBank')
    expect(detectBank(['National Australia Bank Limited ABN 00 000 000 000'], 'Transfer to Westpac')).toBe('NAB')
  })
  it('otherwise goes by the bank named most often', () => {
    expect(detectBank([], 'NAB Visa · NAB Connect · Transfer to Westpac')).toBe('NAB')
    expect(detectBank([], 'Commonwealth Bank of Australia')).toBe('CommBank')
    expect(detectBank([], 'nothing here')).toBeUndefined()
  })
})

describe('detectAccountSuffix', () => {
  it.each([
    ['Account/Card number xxxxxxxxxx909876', '9876'],
    ['BSB 000-000 Account 11112222', '2222'],
    ['Account number: 1111 2222 3', '2223'],
  ])('finds the last 4 digits in %s', (text, suffix) => {
    expect(detectAccountSuffix(text)).toBe(suffix)
  })
})

describe('detectPeriod', () => {
  it.each([
    ['This statement covers transactions from 01-Jan-2026 to 31-Mar-2026', { from: '2026-01-01', to: '2026-03-31' }],
    ['1st Jan 2026 - 28th Feb 2026', { from: '2026-01-01', to: '2026-02-28' }],
    ['Statement period 01/06/2026 – 30/06/2026', { from: '2026-06-01', to: '2026-06-30' }],
  ])('reads %s', (text, period) => {
    expect(detectPeriod(text)).toEqual(period)
  })
  it('falls back to the latest year mentioned', () => {
    expect(detectPeriod('no dates')).toBeUndefined()
    expect(latestYear('Printed 2025, covering 2026')).toBe(2026)
  })
})

describe('detectTotals', () => {
  it('reads opening and closing balances, including CR and DR', () => {
    expect(detectTotals('Opening balance $500.00 CR\n...\nClosing Balance\n$2,500.00 CR')).toEqual({ opening: 500, closing: 2500 })
    expect(detectTotals('Opening Balance -$215.00 Closing Balance $38.60 DR')).toEqual({ opening: -215, closing: -38.6 })
    expect(detectTotals('nothing')).toEqual({})
  })
})
