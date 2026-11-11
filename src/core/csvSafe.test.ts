import { describe, expect, it } from 'vitest'
import { csvCell } from './csvSafe'

describe('csvCell', () => {
  it.each([
    ['=HYPERLINK("http://example.invalid","x")', `"'=HYPERLINK(""http://example.invalid"",""x"")"`],
    ['+SUM(A1:A2)', `"'+SUM(A1:A2)"`],
    ['-2+3', `"'-2+3"`],
    ['@cmd', `"'@cmd"`],
    ['\tTAB', `"'\tTAB"`],
  ])('neutralises %s', (raw, out) => {
    expect(csvCell(raw)).toBe(out)
  })

  it.each([
    ['-12.50', '"-12.50"'],
    ['500.00', '"500.00"'],
    ['Bramblecup Coffee', '"Bramblecup Coffee"'],
    ['', '""'],
  ])('leaves %s as it is', (raw, out) => {
    expect(csvCell(raw)).toBe(out)
  })
})
