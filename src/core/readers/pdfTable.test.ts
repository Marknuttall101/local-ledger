import { describe, expect, it } from 'vitest'
import { pdfToTable } from './pdfTable'
import { pdfLine } from './testing'

describe('pdfToTable with column titles', () => {
  it('reads a statement with separate Debit/Credit, a Category column, and a second line under each row', () => {
    const items = [
      ...pdfLine(765, [[50, 'Transaction history']]),
      ...pdfLine(738, [[50, '1st Jan 2026 - 28th Feb 2026']]),
      ...pdfLine(508, [[55, 'Date'], [130, 'Description'], [370, 'Category'], [455, 'Debit'], [517, 'Credit']]),
      ...pdfLine(481, [[55, '11 Feb 2026'], [130, 'Bramblecup Coffee'], [330, 'Cafes and coffee'], [447, '-$7.40']]),
      ...pdfLine(466, [[130, 'From: Main Account']]),
      ...pdfLine(391, [[55, '09 Feb 2026'], [130, 'Internal transfer'], [347, 'Internal transfer'], [497, '+$100.00']]),
      ...pdfLine(376, [[130, 'From: Second Account To: Main Account']]),
      ...pdfLine(44, [[50, '1 of 2']]),
      ...pdfLine(32, [[50, 'Issued by Example Bank Ltd ABN 00 000 000 000']]),
      ...pdfLine(753, [[55, '03 Jan 2026'], [130, 'Internal transfer'], [347, 'Internal transfer'], [507, '+$50.00']], 2),
      ...pdfLine(738, [[130, 'From: Second Account To: Main Account']], 2),
      ...pdfLine(708, [[55, '02 Jan 2026'], [130, 'Transfer To Example Saver'], [362, 'Transfer out'], [433, '-$200.00']], 2),
      ...pdfLine(693, [[130, 'From: Main Account']], 2),
      ...pdfLine(44, [[50, '2 of 2']], 2),
      ...pdfLine(32, [[50, 'Issued by Example Bank Ltd ABN 00 000 000 000']], 2),
    ]
    const t = pdfToTable(items)!
    expect(t.period).toEqual({ from: '2026-01-01', to: '2026-02-28' })
    expect(t.rows).toEqual([
      ['Date', 'Description', 'Category', 'Debit', 'Credit'],
      // The second line stays in the description here; reading the rows moves it into the note
      ['2026-02-11', 'Bramblecup Coffee From: Main Account', 'Cafes and coffee', '-$7.40', ''],
      ['2026-02-09', 'Internal transfer From: Second Account To: Main Account', 'Internal transfer', '', '+$100.00'],
      ['2026-01-03', 'Internal transfer From: Second Account To: Main Account', 'Internal transfer', '', '+$50.00'],
      ['2026-01-02', 'Transfer To Example Saver From: Main Account', 'Transfer out', '-$200.00', ''],
    ])
  })

  it('reads a Westpac-style statement: wrapped descriptions around the date, and a row that wraps onto the next page', () => {
    const items = [
      ...pdfLine(572, [[45, 'This statement covers transactions from 01-Jan-2026 to 31-Mar-2026']]),
      ...pdfLine(499, [[50, 'Date'], [138, 'Description'], [382, 'Withdrawal'], [469, 'Deposit']]),
      ...pdfLine(474, [[50, '17 Mar 2026'], [136, 'AUTOMATIC PAYMENT'], [465, '$500.00']]),
      ...pdfLine(449, [[50, '17 Mar 2026'], [136, 'UBER *EATS HELP.UBER.COM AUS'], [394, '-$27.65']]),
      ...pdfLine(430, [[136, 'GLOAMWICK HALL EVENTS BOOKING']]),
      ...pdfLine(425, [[50, '15 Mar 2026'], [389, '-$60.00']]),
      ...pdfLine(420, [[136, 'PELLACOMBE AUS']]),
      ...pdfLine(97, [[136, 'EXAMPLE TRANSIT TOPUP USA FRGN AMT: 10.00']]),
      ...pdfLine(79, [[42, 'Copyright © 2026 Westpac Banking Corporation']]),
      ...pdfLine(45, [[436, 'Page 1 of 2']]),
      ...pdfLine(705, [[50, '14 Mar 2026'], [136, 'U. S. DOLLAR'], [394, '-$15.00']], 2),
      ...pdfLine(680, [[50, '12 Mar 2026'], [136, 'Komorebi Noodle House Varnholt AUS'], [398, '-$14.20']], 2),
      ...pdfLine(79, [[42, 'Copyright © 2026 Westpac Banking Corporation']], 2),
      ...pdfLine(45, [[436, 'Page 2 of 2']], 2),
    ]
    const t = pdfToTable(items)!
    expect(t.bank).toBe('Westpac')
    expect(t.rows).toEqual([
      ['Date', 'Description', 'Withdrawal', 'Deposit'],
      ['2026-03-17', 'AUTOMATIC PAYMENT', '', '$500.00'],
      ['2026-03-17', 'UBER *EATS HELP.UBER.COM AUS', '-$27.65', ''],
      ['2026-03-15', 'GLOAMWICK HALL EVENTS BOOKING PELLACOMBE AUS', '-$60.00', ''],
      ['2026-03-14', 'EXAMPLE TRANSIT TOPUP USA FRGN AMT: 10.00 U. S. DOLLAR', '-$15.00', ''],
      ['2026-03-12', 'Komorebi Noodle House Varnholt AUS', '-$14.20', ''],
    ])
  })

  it('fills in years across New Year and keeps balance lines as rows (they are skipped later)', () => {
    const items = [
      ...pdfLine(700, [[40, 'Statement period 20 Dec 2025 to 19 Jan 2026']]),
      ...pdfLine(650, [[40, 'Date'], [100, 'Transaction'], [330, 'Debit'], [400, 'Credit'], [470, 'Balance']]),
      ...pdfLine(630, [[40, '20 Dec'], [100, 'OPENING BALANCE'], [470, '$500.00 CR']]),
      ...pdfLine(610, [[40, '22 Dec'], [100, 'Woolworths Quillmere'], [330, '73.15'], [470, '$426.85 CR']]),
      ...pdfLine(590, [[40, '02 Jan'], [100, 'Salary ACME'], [400, '2,000.00'], [470, '$2,426.85 CR']]),
      ...pdfLine(570, [[40, '19 Jan'], [100, 'CLOSING BALANCE'], [470, '$2,426.85 CR']]),
    ]
    const t = pdfToTable(items)!
    expect(t.rows.map((r) => r[0])).toEqual(['Date', '2025-12-20', '2025-12-22', '2026-01-02', '2026-01-19'])
    expect(t.rows[2]).toEqual(['2025-12-22', 'Woolworths Quillmere', '73.15', '', '$426.85 CR'])
  })

  it('gives up on a PDF with no dated rows', () => {
    expect(pdfToTable(pdfLine(500, [[50, 'Dear customer, thank you for banking with us.']]))).toBeUndefined()
  })
})

describe('pdfToTable without column titles', () => {
  it('works out the columns from where dates and amounts sit; the last amount column is the balance', () => {
    const items = [
      ...pdfLine(700, [[40, 'Everyday Account 000-000 11112222']]),
      ...pdfLine(650, [[40, '06/05/2026'], [110, 'TINLANTERN ESPRESSO'], [400, '-11.60'], [480, '788.40']]),
      ...pdfLine(630, [[40, '07/05/2026'], [110, 'SALARY ACME PTY LTD'], [395, '2,000.00'], [480, '2,788.40']]),
      ...pdfLine(610, [[40, '08/05/2026'], [110, 'SPOTIFY'], [400, '-12.49'], [480, '2,775.91']]),
    ]
    const t = pdfToTable(items)!
    expect(t.accountSuffix).toBe('2222')
    expect(t.rows).toEqual([
      ['Date', 'Description', 'Amount', 'Balance'],
      ['2026-05-06', 'TINLANTERN ESPRESSO', '-11.60', '788.40'],
      ['2026-05-07', 'SALARY ACME PTY LTD', '2,000.00', '2,788.40'],
      ['2026-05-08', 'SPOTIFY', '-12.49', '2,775.91'],
    ])
  })

  it('needs at least three dated rows with amounts to trust a guess', () => {
    expect(pdfToTable(pdfLine(650, [[40, '06/05/2026'], [110, 'Something'], [400, '-11.60']]))).toBeUndefined()
  })
})
