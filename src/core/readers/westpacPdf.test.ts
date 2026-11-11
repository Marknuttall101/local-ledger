import { describe, expect, it } from 'vitest'
import type { PdfItem, ReaderInput } from './types'
import { westpacPdfReader } from './westpacPdf'

const item = (str: string, x: number, y: number, page = 1): PdfItem => ({ str, x, y, width: str.length * 4, page })

/** Synthetic page that copies the Westpac layout, with invented data */
function fixture(): ReaderInput {
  const items: PdfItem[] = [
    item('ALEX SAMPLE', 45, 657),
    item('1 EXAMPLE ST', 45, 646),
    item('xxxxxxxxxx904321', 268, 646),
    item('Example Card', 189, 696),
    item('Statement of recent transactions', 175, 683),
    item('Date', 50, 499),
    item('Description', 138, 499),
    item('Withdrawal', 382, 499),
    item('Deposit', 469, 499),
    item('19 Jun 2026', 50, 474),
    item('Coles Online Pellacombe AUS', 136, 474),
    item('-$66.45', 394, 474),
    item('15 Jun 2026', 50, 449),
    item('AUTOMATIC PAYMENT', 136, 449),
    item('$500.00', 465, 449),
    // Two-line description with the amount in the middle
    item('09 Jun 2026', 50, 425),
    item('GLOAMWICK HALL EVENTS BOOKING', 136, 430),
    item('PELLACOMBE AUS', 136, 421),
    item('-$60.00', 389, 425),
    // Fee row: amount only inside the description
    item('21 Feb 2026', 50, 400),
    item('FOREIGN FEE AUD', 136, 405),
    item('0.45 FRGN AMT: 10.00 U. S.', 216, 405),
    item('DOLLAR', 136, 396),
    item('21 Feb 2026', 50, 376),
    item('ZENTROVA CLOUD SVCS EXAMPLE USA FRGN', 136, 380),
    item('AMT: 10.00 U. S. DOLLAR', 136, 371),
    item('-$15.00', 394, 376),
    item('Page 1 of 2', 436, 45),
    item('Westpac Banking Corporation', 83, 79),
    item('Things you should know', 45, 300, 2),
    item('02 Mar 2026', 50, 705, 2),
    item('INTEREST CHARGES', 136, 705, 2),
    item('-$1.84', 398, 705, 2),
  ]
  return { kind: 'pdf', fileName: 'x.pdf', items, text: items.map((i) => i.str).join('\n') }
}

describe('westpacPdfReader', () => {
  it('detects Westpac statements', () => {
    expect(westpacPdfReader.detect(fixture())).toBe(1)
    expect(westpacPdfReader.detect({ kind: 'csv', fileName: 'a.csv', rows: [] })).toBe(0)
  })

  it('reads the layout, including wrapped rows and fee rows', () => {
    const s = westpacPdfReader.read(fixture())
    expect(s.accountLabel).toBe('Example Card')
    expect(s.accountSuffix).toBe('4321')
    expect(s.warnings).toEqual([])
    expect(s.transactions).toEqual([
      { date: '2026-06-19', rawDescription: 'Coles Online Pellacombe AUS', amount: -66.45 },
      { date: '2026-06-15', rawDescription: 'AUTOMATIC PAYMENT', amount: 500 },
      { date: '2026-06-09', rawDescription: 'GLOAMWICK HALL EVENTS BOOKING PELLACOMBE AUS', amount: -60 },
      { date: '2026-02-21', rawDescription: 'FOREIGN FEE AUD 0.45', amount: -0.45, note: 'FRGN AMT: 10.00 U. S. DOLLAR' },
      {
        date: '2026-02-21',
        rawDescription: 'ZENTROVA CLOUD SVCS EXAMPLE USA',
        amount: -15,
        note: 'FRGN AMT: 10.00 U. S. DOLLAR',
        foreign: true,
      },
      { date: '2026-03-02', rawDescription: 'INTEREST CHARGES', amount: -1.84 },
    ])
  })
})

describe('rows split across a page break', () => {
  it('joins the lines left at the bottom of a page onto the first row of the next page', () => {
    const items: PdfItem[] = [
      item('Westpac Banking Corporation', 83, 79),
      item('Statement of recent transactions', 175, 683),
      item('Withdrawal', 382, 499),
      item('Description', 138, 499),
      item('27 Apr 2026', 50, 117),
      item('Corner Pantry 4471 Orrindale AUS', 136, 117),
      item('-$6.30', 398, 117),
      item('FOREIGN FEE AUD', 136, 97),
      item('0.90 FRGN AMT: 20.00 U. S.', 216, 97),
      item('Page 3 of 4', 431, 45),
      item('27 Apr 2026', 50, 705, 2),
      item('DOLLAR', 136, 705, 2),
    ]
    const s = westpacPdfReader.read({ kind: 'pdf', fileName: 'x', items, text: items.map((i) => i.str).join('\n') })
    expect(s.warnings).toEqual([])
    expect(s.transactions[1]).toEqual({
      date: '2026-04-27',
      rawDescription: 'FOREIGN FEE AUD 0.90',
      amount: -0.9,
      note: 'FRGN AMT: 20.00 U. S. DOLLAR',
    })
  })
})
