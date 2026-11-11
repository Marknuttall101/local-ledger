import { describe, expect, it } from 'vitest'
import type { StatementInfo } from '../types'
import { decide, signatureFor } from './generic'

const pdf: StatementInfo = { kind: 'pdf', fileName: 'statement.pdf', bank: 'Example Bank', accountSuffix: '4321' }

describe('decide', () => {
  it('goes straight to the preview when amounts carry their own signs', () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Debit', 'Credit'],
      ['2026-02-11', 'Bramblecup Coffee', 'Cafes and coffee', '-$7.40', ''],
      ['2026-02-09', 'Internal transfer', 'Internal transfer', '', '+$100.00'],
    ]
    const d = decide(rows, pdf)
    expect(d.status).toBe('recognised')
    if (d.status !== 'recognised') return
    expect(d.statement.bank).toBe('Example Bank')
    expect(d.statement.accountSuffix).toBe('4321')
    expect(d.statement.check?.status).toBe('unchecked')
    expect(d.statement.transactions.map((t) => t.amount)).toEqual([-7.4, 100])
    expect(d.mapping.signature.startsWith('pdf:')).toBe(true)
  })

  it('asks about the columns when the running balance shows the guess is wrong', () => {
    const rows = [
      ['14/04/2026', 'WOOLWORTHS 3318 QUILLMERE', '61.30', '538.70'],
      ['15/04/2026', 'SALARY ACME', '2000.00', '2538.70'],
      ['16/04/2026', 'DISNEY PLUS', '14.49', '2524.21'],
      ['17/04/2026', 'FENNICK BAY FUEL', '72.80', '2451.41'],
    ]
    // Unsigned amounts: the guess flips them to spending, and the salary row then fails the check
    const d = decide(rows, { kind: 'csv', fileName: 'x.csv' })
    expect(d.status).toBe('needs-mapping')
  })

  it('asks about the columns when nothing confirms the reading', () => {
    const rows = [
      ['14/04/2026', 'TIDEMARK BARBERS', 'ORRINDALE', '36.00'],
      ['15/04/2026', 'DISNEY PLUS', 'ONLINE', '14.49'],
    ]
    expect(decide(rows, { kind: 'csv', fileName: 'x.csv' }).status).toBe('needs-mapping')
  })

  it('reuses a layout the user confirmed before', () => {
    const rows = [
      ['14/04/2026', 'TIDEMARK BARBERS', 'ORRINDALE', '36.00'],
      ['15/04/2026', 'DISNEY PLUS', 'ONLINE', '14.49'],
    ]
    const info: StatementInfo = { kind: 'csv', fileName: 'x.csv' }
    const saved = { signature: signatureFor(rows, info), bank: 'Mystery Bank', accountLabel: 'Card', dateColumn: 0, descriptionColumn: 1, amountColumn: 3, dateFormat: 'DMY' as const, invertAmounts: true, hasHeader: false }
    const d = decide(rows, info, saved)
    expect(d.status).toBe('recognised')
    if (d.status === 'recognised') expect(d.statement.transactions.map((t) => t.amount)).toEqual([-36, -14.49])
  })
})

describe('decide with unreadable rows', () => {
  it('asks about the columns when many rows could not be read, even if the balances add up', () => {
    const rows = [
      ['Date', 'Description', 'Withdrawal', 'Deposit', 'Balance'],
      ['2026-06-19', '', '-$1,700.00', '', '$9,300.00'],
      ['2026-06-19', 'DEPOSIT ONLINE', '', '$3,400.00', '$11,000.00'],
      ['2026-06-19', '', '', '$2,000.00', '$7,600.00'],
      ['2026-06-12', 'PAYMENT BY AUTHORITY', '-$987.65', '', '$5,600.00'],
    ]
    expect(decide(rows, { kind: 'pdf', fileName: 'x.pdf' }).status).toBe('needs-mapping')
  })
})
