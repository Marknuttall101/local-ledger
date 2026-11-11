// Cases found in the whole-branch review: each reproduces a way a statement could be read wrongly
import { describe, expect, it } from 'vitest'
import type { StatementInfo } from '../types'
import { amountFromCell, guessCsvMapping, readCsvWithMapping } from './csv'
import { decide, signatureFor } from './generic'
import { pdfToTable } from './pdfTable'
import { pdfLine } from './testing'

const csv: StatementInfo = { kind: 'csv', fileName: 'x.csv' }

describe('which way the money went', () => {
  it('a plus sign always means money in', () => {
    expect(amountFromCell('+$215.00', true)).toBe(215)
  })

  it("doesn't flip amounts when some show a plus sign", () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['11/05/2026', 'INTEREST', '+$0.87'],
      ['12/05/2026', 'DEPOSIT', '+$215.00'],
      ['13/05/2026', 'DEPOSIT', '+$35.00'],
      ['14/05/2026', 'INTEREST', '+$0.92'],
    ]
    expect(guessCsvMapping(rows).invertAmounts).toBe(false)
  })

  it('asks when a card shows purchases without a sign and payments with a minus', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Balance'],
      ['11/05/2026', 'WOOLWORTHS', '58.10', '208.10'],
      ['12/05/2026', 'DISNEY PLUS', '14.49', '222.59'],
      ['13/05/2026', 'PAYMENT', '-150.00', '72.59'],
      ['14/05/2026', 'BRAMBLECUP COFFEE', '6.20', '78.79'],
    ]
    expect(decide(rows, csv).status).toBe('needs-mapping')
  })

  it('asks about an account where almost everything is money in, rather than guessing', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Balance'],
      ['11/05/2026', 'INTEREST', '+$0.87', '300.87'],
      ['12/05/2026', 'DEPOSIT', '+$215.00', '515.87'],
      ['13/05/2026', 'DEPOSIT', '+$35.00', '550.87'],
      ['14/05/2026', 'INTEREST', '+$0.92', '551.79'],
    ]
    expect(decide(rows, csv).status).toBe('needs-mapping')
  })

  it('still goes straight through for an ordinary account with signed amounts', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Balance'],
      ['11/05/2026', 'WOOLWORTHS', '-58.10', '741.90'],
      ['12/05/2026', 'FENNICK BAY FUEL', '-71.40', '670.50'],
      ['13/05/2026', 'SALARY', '2000.00', '2670.50'],
      ['14/05/2026', 'DISNEY PLUS', '-14.49', '2656.01'],
    ]
    expect(decide(rows, csv).status).toBe('recognised')
  })
})

const titles = (page: number, y = 700) => pdfLine(y, [[40, 'Date'], [100, 'Description'], [330, 'Debit'], [400, 'Credit'], [470, 'Balance']], page)

describe('balance lines without a date', () => {
  it('never joins "Balance carried/brought forward" onto a transaction', () => {
    const items = [
      ...titles(1),
      ...pdfLine(660, [[40, '05 May 2026'], [100, 'WOOLWORTHS QUILLMERE'], [330, '58.10'], [470, '441.90']]),
      ...pdfLine(620, [[40, '06 May 2026'], [100, 'FENNICK BAY FUEL'], [330, '71.40'], [470, '370.50']]),
      ...pdfLine(602, [[100, 'Balance carried forward'], [470, '370.50']]),
      ...titles(2),
      ...pdfLine(680, [[100, 'Balance brought forward'], [470, '370.50']], 2),
      ...pdfLine(662, [[40, '07 May 2026'], [100, 'TIDEMARK BARBERS'], [330, '36.00'], [470, '334.50']], 2),
      ...pdfLine(622, [[40, '08 May 2026'], [100, 'SALARY'], [400, '2,000.00'], [470, '2,334.50']], 2),
    ]
    const t = pdfToTable(items)!
    expect(t.rows.slice(1).map((r) => [r[1], r[4]])).toEqual([
      ['WOOLWORTHS QUILLMERE', '441.90'],
      ['FENNICK BAY FUEL', '370.50'],
      ['TIDEMARK BARBERS', '334.50'],
      ['SALARY', '2,334.50'],
    ])
  })

  it('reads a transaction that merely mentions a carried-forward balance', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['2026-05-07', 'TIDEMARK BARBERS Balance brought forward', '-36.00'],
    ]
    expect(readCsvWithMapping(rows, guessCsvMapping(rows)).transactions).toHaveLength(1)
  })

  it("doesn't carry a line with an amount onto the next page's first transaction", () => {
    const items = [
      ...titles(1),
      ...pdfLine(660, [[40, '05 May 2026'], [100, 'WOOLWORTHS'], [330, '58.10'], [470, '441.90']]),
      ...pdfLine(620, [[40, '06 May 2026'], [100, 'FENNICK BAY FUEL'], [330, '71.40'], [470, '370.50']]),
      ...pdfLine(300, [[100, 'Pending, not yet processed'], [400, '9.00']]),
      ...titles(2),
      ...pdfLine(662, [[40, '07 May 2026'], [100, 'TIDEMARK BARBERS'], [330, '36.00'], [470, '334.50']], 2),
      ...pdfLine(622, [[40, '08 May 2026'], [100, 'CORNER PANTRY'], [330, '4.50'], [470, '330.00']], 2),
    ]
    const t = pdfToTable(items)!
    expect(t.rows[3]).toEqual(['2026-05-07', 'TIDEMARK BARBERS', '36.00', '', '334.50'])
  })
})

describe('page headers and footers', () => {
  it('keeps a wrapped line that sits at the same height on every page, and the bank stays right', () => {
    const page = (p: number) => [
      ...pdfLine(700, [[50, 'Date'], [138, 'Description'], [382, 'Withdrawal'], [469, 'Deposit']], p),
      ...pdfLine(670, [[50, `0${p} May 2026`], [136, 'GLOAMWICK HALL'], [389, '-$60.00']], p),
      ...pdfLine(662, [[136, 'EVENTS PELLACOMBE']], p),
      ...pdfLine(640, [[50, `1${p} May 2026`], [136, 'CORNER PANTRY'], [394, '-$4.50']], p),
      ...pdfLine(79, [[42, 'Copyright © 2026 Westpac Banking Corporation']], p),
    ]
    const t = pdfToTable([...page(1), ...page(2)])!
    expect(t.bank).toBe('Westpac')
    expect(t.rows[1][1]).toBe('GLOAMWICK HALL EVENTS PELLACOMBE')
    expect(t.rows[3][1]).toBe('GLOAMWICK HALL EVENTS PELLACOMBE')
  })
})

describe('years for dates printed without one', () => {
  it('uses the full dates printed elsewhere when the period wording is unusual', () => {
    const items = [
      ...pdfLine(760, [[40, 'Statement opens 20 Dec 2025 and closes 19 Jan 2026']]),
      ...titles(1),
      ...pdfLine(660, [[40, '22 Dec'], [100, 'Woolworths'], [330, '73.15'], [470, '426.85']]),
      ...pdfLine(640, [[40, '02 Jan'], [100, 'Salary'], [400, '2,000.00'], [470, '2,426.85']]),
    ]
    expect(pdfToTable(items)!.rows.slice(1).map((r) => r[0])).toEqual(['2025-12-22', '2026-01-02'])
  })
})

describe('remembered layouts', () => {
  const rows = [
    ['Date', 'Description', 'Amount', 'Balance'],
    ['11/05/2026', 'WOOLWORTHS', '-58.10', '741.90'],
    ['12/05/2026', 'FENNICK BAY FUEL', '-71.40', '670.50'],
    ['13/05/2026', 'SALARY', '2000.00', '2670.50'],
    ['14/05/2026', 'DISNEY PLUS', '-14.49', '2656.01'],
  ]

  it('are kept separately for each bank', () => {
    expect(signatureFor(rows, { kind: 'pdf', fileName: 'a.pdf', bank: 'ANZ' })).not.toBe(signatureFor(rows, { kind: 'pdf', fileName: 'b.pdf', bank: 'NAB' }))
  })

  it("aren't trusted when the balances show they don't fit, and keep the bank found in the file", () => {
    const info: StatementInfo = { kind: 'pdf', fileName: 'x.pdf', bank: 'ANZ' }
    const base = { signature: signatureFor(rows, info), bank: 'Mystery Bank', accountLabel: 'Card', dateColumn: 0, descriptionColumn: 1, dateFormat: 'DMY' as const, invertAmounts: false, hasHeader: true }
    expect(decide(rows, info, { ...base, amountColumn: 3, balanceColumn: 2 }).status).toBe('needs-mapping')
    const ok = decide(rows, info, { ...base, amountColumn: 2, balanceColumn: 3 })
    expect(ok.status).toBe('recognised')
    if (ok.status === 'recognised') expect(ok.statement.bank).toBe('ANZ')
  })
})

describe('fees written into the description', () => {
  it('only reads foreign transaction fees that way, and never refunds', () => {
    const rows = [
      ['Date', 'Description', 'Withdrawal', 'Deposit'],
      ['2026-05-19', 'FOREIGN TRANSACTION FEE AUD 0.83', '', ''],
      ['2026-05-20', 'FEE REFUND AUD 0.83', '', ''],
    ]
    const s = readCsvWithMapping(rows, guessCsvMapping(rows))
    expect(s.transactions.map((t) => t.amount)).toEqual([-0.83])
    expect(s.warnings).toHaveLength(1)
  })
})
