import { describe, expect, it } from 'vitest'
import type { Transaction } from '../core/types'
import { localIsoDate, sourceLabel } from './format'

const tx = (categorySource: Transaction['categorySource'], confidence: number): Transaction => ({
  id: 't',
  accountId: 'a',
  importId: 'i',
  date: '2026-01-01',
  rawDescription: 'SHOP',
  amount: -1,
  merchant: 'Shop',
  merchantKey: 'shop',
  categoryId: 'cafes',
  categorySource,
  confidence,
  isTransfer: false,
})

describe('how a transaction was sorted', () => {
  it('calls an on-device guess a rough guess, without a made-up percentage', () => {
    expect(sourceLabel(tx('fallback', 0.55))).toBe('Rough guess')
    expect(sourceLabel(tx('fallback', 0))).toBe('Not sorted yet')
  })

  it('says the example’s AI answers were saved earlier, not asked for now', () => {
    expect(sourceLabel(tx('ai', 0.9))).toBe('AI (90% sure)')
    expect(sourceLabel(tx('ai', 0.9), true)).toBe('Saved AI answer (90% sure)')
  })
})

describe('import dates', () => {
  it('uses this device’s calendar day, not UTC', () => {
    const lateEvening = new Date(2026, 10, 12, 23, 30)
    expect(localIsoDate(lateEvening)).toBe('2026-11-12')
    const earlyMorning = new Date(2026, 10, 12, 0, 30)
    expect(localIsoDate(earlyMorning.toISOString())).toBe('2026-11-12')
  })
})
