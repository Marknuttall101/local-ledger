import { describe, expect, it } from 'vitest'
import { guessCsvMapping, readCsvWithMapping } from './csv'
import { checkStatement } from './verify'

const check = (rows: string[][], totals?: { opening?: number; closing?: number }) => {
  const m = guessCsvMapping(rows)
  return checkStatement(rows, m, readCsvWithMapping(rows, m).transactions, totals)
}

const newestFirst = [
  ['Date', 'Description', 'Amount', 'Balance'],
  ['14/05/2026', 'DISNEY PLUS', '-14.49', '2656.01'],
  ['13/05/2026', 'SALARY', '2000.00', '2670.50'],
  ['12/05/2026', 'FENNICK BAY FUEL', '-71.40', '670.50'],
  ['11/05/2026', 'WOOLWORTHS', '-58.10', '741.90'],
]

describe('checkStatement', () => {
  it('proves a reading with a running balance, newest-first or oldest-first', () => {
    expect(check(newestFirst)).toEqual({ status: 'balanced', method: 'running-balance', matched: 3, checked: 3 })
    expect(check([newestFirst[0], ...newestFirst.slice(1).reverse()]).status).toBe('balanced')
  })

  it('accepts a card balance that goes up with spending (amount owed)', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Balance'],
      ['11/05/2026', 'WOOLWORTHS', '-58.10', '208.10'],
      ['12/05/2026', 'DISNEY PLUS', '-14.49', '222.59'],
      ['13/05/2026', 'PAYMENT', '150.00', '72.59'],
      ['14/05/2026', 'BRAMBLECUP COFFEE', '-6.20', '78.79'],
    ]
    expect(check(rows).status).toBe('balanced')
  })

  it('spots a misread amount', () => {
    const rows = newestFirst.map((r) => [...r])
    rows[2][2] = '1745.00'
    expect(check(rows).status).toBe('mismatch')
  })

  it('falls back to opening and closing balances, then gives up politely', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['11/05/2026', 'WOOLWORTHS', '-58.10'],
      ['12/05/2026', 'SALARY', '2000.00'],
    ]
    expect(check(rows, { opening: 80, closing: 2021.9 })).toEqual({ status: 'balanced', method: 'totals', matched: 1, checked: 1 })
    expect(check(rows, { opening: 80, closing: 79 }).status).toBe('mismatch')
    expect(check(rows).status).toBe('unchecked')
  })
})
