import { describe, expect, it } from 'vitest'
import { keywordFor, matchesKeyword, suggestKeyword } from './keywords'

describe('suggestKeyword', () => {
  it.each([
    ['EFTPOS 14/03 19:52ZENTROVA AU REF-00004417', 'ZENTROVA'],
    ['Tidemarkery Barbers AUS', 'TIDEMARKERY'],
    ['PAYPAL *GLOAMWICKHALL 5550001234 AUS', 'GLOAMWICKHALL'],
    ['VISA PURCHASE 22/06 SQ *LA QUILLINA NSW AUS', 'QUILLINA'],
  ])('%s → %s', (raw, keyword) => {
    expect(suggestKeyword(raw)).toBe(keyword)
  })
  it('gives nothing when only bank wording is left', () => {
    expect(suggestKeyword('EFTPOS 14/03 19:52 AU')).toBe('')
  })
})

describe('matchesKeyword', () => {
  it('finds the word even when glued to numbers, but not inside a longer word', () => {
    expect(matchesKeyword('EFTPOS 14/03 19:52ZENTROVA AU REF-1', 'zentrova')).toBe(true)
    expect(matchesKeyword('ZENTROVAX AUSTRALIA', 'ZENTROVA')).toBe(false)
    expect(matchesKeyword('LA QUILLINA NSW', 'LA QUILLINA')).toBe(true)
    expect(matchesKeyword('anything', '')).toBe(false)
  })
})

describe('keywordFor', () => {
  it('picks the longest matching key word', () => {
    const rules = [
      { keyword: 'ZENTROVA', name: 'Zentrova', at: '' },
      { keyword: 'ZENTROVA PAYROLL', name: 'Zentrova Payroll', at: '' },
    ]
    expect(keywordFor('ZENTROVA PAYROLL AU', rules)?.name).toBe('Zentrova Payroll')
    expect(keywordFor('19:52ZENTROVA AU', rules)?.name).toBe('Zentrova')
    expect(keywordFor('COLES', rules)).toBeUndefined()
  })
})
