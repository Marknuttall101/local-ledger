import { describe, expect, it } from 'vitest'
import { groupLines, isMoneyText, splitRepeated } from './pdfLines'
import { pdfLine } from './testing'

describe('groupLines', () => {
  it('puts pieces at the same height on one line, left to right, and joins pieces that touch', () => {
    const items = [
      ...pdfLine(500, [[300, 'Debit'], [50, 'Date']]),
      { str: '1,234.56', x: 400, y: 481, width: 36, page: 1 },
      { str: 'CR', x: 437, y: 481, width: 10, page: 1 },
      ...pdfLine(480, [[50, '18 Jun 2026'], [130, 'Corner Pantry']]),
    ]
    const lines = groupLines(items)
    expect(lines.map((l) => l.text)).toEqual(['Date Debit', '18 Jun 2026 Corner Pantry 1,234.56 CR'])
    expect(lines[1].cells.map((c) => c.text)).toEqual(['18 Jun 2026', 'Corner Pantry', '1,234.56 CR'])
  })
})

describe('isMoneyText', () => {
  it('needs cents, so years and reference numbers are not money', () => {
    expect(isMoneyText('-$42.00')).toBe(true)
    expect(isMoneyText('1,234.56 CR')).toBe(true)
    expect(isMoneyText('2026')).toBe(false)
    expect(isMoneyText('Oct')).toBe(false)
  })
})

describe('splitRepeated', () => {
  it('sets aside footers that repeat on most pages, but keeps the same purchase on several pages', () => {
    const items = [1, 2, 3].flatMap((p) => [
      ...pdfLine(500, [[50, `0${p} Sep 2026`], [130, 'METROLINK FARES VARNHOLT AUS'], [398, '-$5.35']], p),
      ...pdfLine(45, [[436, `Page ${p} of 3`]], p),
      ...pdfLine(79, [[42, 'Copyright © 2026 Westpac Banking Corporation']], p),
    ])
    const { kept, furniture } = splitRepeated(groupLines(items))
    expect(kept.map((l) => l.text)).toEqual(['01 Sep 2026 METROLINK FARES VARNHOLT AUS -$5.35', '02 Sep 2026 METROLINK FARES VARNHOLT AUS -$5.35', '03 Sep 2026 METROLINK FARES VARNHOLT AUS -$5.35'])
    expect(furniture.map((l) => l.text)).toContain('Copyright © 2026 Westpac Banking Corporation')
  })
})

describe('splitRepeated keeps wrapped descriptions', () => {
  it('keeps a description line that repeats on several pages at different heights', () => {
    const items = [1, 2].flatMap((p) => [
      ...pdfLine(400 + p * 30, [[133, 'PAYMENT BY AUTHORITY TO CC PAYMENT']], p),
      ...pdfLine(395 + p * 30, [[42, `0${p} Sep 2026`], [345, '-$500.00']], p),
      ...pdfLine(88, [[36, 'Copyright © 2025 Westpac Banking Corporation']], p),
    ])
    const { kept, furniture } = splitRepeated(groupLines(items))
    expect(kept.filter((l) => l.text === 'PAYMENT BY AUTHORITY TO CC PAYMENT')).toHaveLength(2)
    expect(furniture.map((l) => l.text)).toEqual(['Copyright © 2025 Westpac Banking Corporation', 'Copyright © 2025 Westpac Banking Corporation'])
  })
})
