import { describe, expect, it } from 'vitest'
import { amountFromCell, csvPresetReaders, csvSignature, guessCsvMapping, readCsvWithMapping } from './csv'
import type { ReaderInput } from './types'

const input = (rows: string[][]): ReaderInput => ({ kind: 'csv', fileName: 'Everyday.csv', rows })
const detect = (rows: string[][]) => csvPresetReaders.find((r) => r.detect(input(rows)) > 0)

const cba = [
  ['22/07/2026', '-8.90', 'TINLANTERN ESPRESSO PELLACOMBE NS AUS Card xx4321 Value Date: 20/07/2026', '+642.15'],
  ['23/07/2026', '+2000.00', 'Salary ACME PTY LTD', '+2642.15'],
]

describe('CSV presets', () => {
  it('reads CommBank files', () => {
    const r = detect(cba)!
    expect(r.id).toBe('cba-csv')
    const s = r.read(input(cba))
    expect(s.transactions).toEqual([
      { date: '2026-07-22', rawDescription: 'TINLANTERN ESPRESSO PELLACOMBE NS AUS', amount: -8.9, note: 'Value Date: 20/07/2026' },
      { date: '2026-07-23', rawDescription: 'Salary ACME PTY LTD', amount: 2000 },
    ])
  })

  it('reads Westpac CSV exports with debit and credit columns', () => {
    const rows = [
      ['Bank Account', 'Date', 'Narrative', 'Debit Amount', 'Credit Amount', 'Balance', 'Categories', 'Serial'],
      ['000000111111', '18/07/2026', 'DISNEY PLUS', '14.49', '', '85.51', 'OTHER', ''],
      ['000000111111', '19/07/2026', 'DEPOSIT PAY', '', '740.00', '825.51', 'DEP', ''],
    ]
    const s = detect(rows)!.read(input(rows))
    expect(s.bank).toBe('Westpac')
    expect(s.transactions.map((t) => t.amount)).toEqual([-14.49, 740])
  })

  it('reads ANZ files', () => {
    const rows = [['26/07/2026', '-6.20', 'BRAMBLECUP COFFEE QUILLMERE']]
    expect(detect(rows)!.id).toBe('anz-csv')
  })
})

describe('unknown layouts', () => {
  it('guesses the columns of a headed file with separate debit/credit', () => {
    const rows = [
      ['Posted', 'Details', 'Money Out', 'Money In', 'Balance'],
      ['2026-07-03', 'Spotify', '12.49', '', '61.20'],
      ['2026-07-04', 'Refund', '', '7.35', '68.55'],
    ]
    const m = guessCsvMapping(rows, 'my bank.csv')
    expect(m).toMatchObject({ dateColumn: 0, descriptionColumn: 1, debitColumn: 2, creditColumn: 3, hasHeader: true, accountLabel: 'my bank' })
    expect(readCsvWithMapping(rows, m).transactions.map((t) => t.amount)).toEqual([-12.49, 7.35])
  })

  it('guesses a headerless file and skips the balance column', () => {
    const rows = [
      ['21/07/2026', 'UBER EATS', '-33.10', '466.90'],
      ['22/07/2026', 'WOOLWORTHS', '-97.45', '369.45'],
    ]
    expect(guessCsvMapping(rows)).toMatchObject({ dateColumn: 0, descriptionColumn: 1, amountColumn: 2, hasHeader: false })
  })

  it('spots spending shown as positive numbers', () => {
    const rows = [['Date', 'Description', 'Amount'], ...[1, 2, 3, 4].map((d) => [`1${d}/07/2026`, 'Shop', '9.00'])]
    expect(guessCsvMapping(rows).invertAmounts).toBe(true)
  })

  it('gives the same signature to files with the same header', () => {
    expect(csvSignature([['Date', 'Amount'], ['3/4/2026', '1']])).toBe(csvSignature([['date', 'AMOUNT'], ['4/4/2026', '7']]))
  })

  it('reports rows it cannot read', () => {
    const rows = [['Date', 'Description', 'Amount'], ['not a date', 'x', '1.00'], ['12/07/2026', 'ok', '-3.00']]
    const s = readCsvWithMapping(rows, guessCsvMapping(rows))
    expect(s.transactions).toHaveLength(1)
    expect(s.warnings[0]).toMatch(/Row 2/)
  })
})

describe('reading unfamiliar layouts', () => {
  it('finds the balance column and plural titles', () => {
    const rows = [
      ['Date', 'Details', 'Withdrawals', 'Deposits', 'Balance'],
      ['12/07/2026', 'WOOLWORTHS', '61.30', '', '538.70'],
      ['13/07/2026', 'PAY', '', '2000.00', '2538.70'],
    ]
    const m = guessCsvMapping(rows)
    expect([m.debitColumn, m.creditColumn, m.balanceColumn]).toEqual([2, 3, 4])
    expect(readCsvWithMapping(rows, m).transactions.map((t) => t.amount)).toEqual([-61.3, 2000])
  })

  it('reads a credit card with unsigned purchases and CR payments the right way round', () => {
    const rows = [
      ['Date', 'Details', 'Amount'],
      ['12/07/2026', 'WOOLWORTHS', '61.30'],
      ['13/07/2026', 'PAYMENT THANK YOU', '380.00 CR'],
      ['14/07/2026', 'DISNEY PLUS', '14.49'],
      ['15/07/2026', 'BRAMBLECUP COFFEE', '6.20'],
    ]
    const m = guessCsvMapping(rows)
    expect(m.invertAmounts).toBe(true)
    expect(readCsvWithMapping(rows, m).transactions.map((t) => t.amount)).toEqual([-61.3, 380, -14.49, -6.2])
  })

  it('skips opening and closing balance lines without complaining', () => {
    const rows = [
      ['Date', 'Transaction', 'Debit', 'Credit', 'Balance'],
      ['2025-12-20', 'OPENING BALANCE', '', '', '$500.00 CR'],
      ['2025-12-22', 'Woolworths Quillmere', '73.15', '', '$426.85 CR'],
      ['2026-01-19', 'CLOSING BALANCE', '', '', '$426.85 CR'],
    ]
    const s = readCsvWithMapping(rows, guessCsvMapping(rows))
    expect(s.transactions).toHaveLength(1)
    expect(s.warnings).toEqual([])
  })

  it('takes a fee amount from the description, and splits off foreign-currency notes', () => {
    const rows = [
      ['Date', 'Description', 'Withdrawal', 'Deposit'],
      ['2026-03-14', 'FOREIGN FEE AUD 0.55', '', ''],
      ['2026-03-14', 'EXAMPLE TRANSIT TOPUP USA FRGN AMT: 10.00 U. S. DOLLAR', '-$15.00', ''],
    ]
    const t = readCsvWithMapping(rows, guessCsvMapping(rows)).transactions
    expect(t[0]).toMatchObject({ amount: -0.55, rawDescription: 'FOREIGN FEE AUD 0.55' })
    expect(t[1]).toMatchObject({ amount: -15, rawDescription: 'EXAMPLE TRANSIT TOPUP USA', note: 'FRGN AMT: 10.00 U. S. DOLLAR', foreign: true })
  })

  it('treats CR and DR as the final word on direction', () => {
    expect(amountFromCell('380.00 CR', true)).toBe(380)
    expect(amountFromCell('27.00 DR', false)).toBe(-27)
    expect(amountFromCell('-380.00', true)).toBe(380)
    expect(amountFromCell('61.30', true)).toBe(-61.3)
  })
})

describe('account routing notes', () => {
  it("moves 'From: Main Account' wording out of the description into the note", () => {
    const rows = [
      ['Date', 'Description', 'Debit', 'Credit'],
      ['2026-02-11', 'Bramblecup Coffee From: Main Account', '-$7.40', ''],
      ['2026-02-09', 'Internal transfer From: Second Account To: Main Account', '', '+$100.00'],
      ['2026-01-27', 'Refund From Example Store To: Main Account', '', '+$20.00'],
    ]
    const t = readCsvWithMapping(rows, guessCsvMapping(rows)).transactions
    expect(t.map((x) => x.rawDescription)).toEqual(['Bramblecup Coffee', 'Internal transfer', 'Refund From Example Store'])
    expect(t[1].note).toBe('From: Second Account To: Main Account')
  })
})
