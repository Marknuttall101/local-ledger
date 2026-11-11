import { describe, expect, it } from 'vitest'
import { AUTO_ACCEPT, categoriseOne, merchantsNeedingAi, needsReview, oddShopName, type CategoriseContext } from './categorise'
import { STARTER_CATEGORIES } from './categories'
import { fallbackClassifier } from './fallbackClassifier'
import { makeTx } from './testing'

const ctx = (over: Partial<CategoriseContext> = {}): CategoriseContext => ({
  rules: new Map(),
  insights: new Map(),
  categoryIds: new Set(STARTER_CATEGORIES.map((c) => c.id)),
  ...over,
})

const insight = (merchantKey: string, categoryId: string, confidence: number) => ({
  merchantKey,
  categoryId,
  confidence,
  subscriptionLikelihood: 0,
  suspiciousLikelihood: 0,
  source: 'ai' as const,
  at: '',
})

describe('categoriseOne', () => {
  it('uses the built-in list first', () => {
    expect(categoriseOne(makeTx('2026-04-07', -63.2, 'PAYPAL *COLESSUPERM 5550001234 AUS'), ctx())).toMatchObject({
      categoryId: 'groceries',
      categorySource: 'builtin',
    })
  })

  it('marks card repayments as transfers', () => {
    expect(categoriseOne(makeTx('2026-04-07', 500, 'AUTOMATIC PAYMENT'), ctx())).toMatchObject({ categoryId: 'transfers', isTransfer: true })
  })

  it('lets the user rules win over everything else', () => {
    const t = makeTx('2026-04-11', -50, 'Coles Online Pellacombe AUS')
    const c = ctx({ rules: new Map([[t.merchantKey, { merchantKey: t.merchantKey, categoryId: 'household', createdAt: '' }]]) })
    expect(categoriseOne(t, c)).toMatchObject({ categoryId: 'household', categorySource: 'rule' })
  })

  it('keeps single-transaction overrides', () => {
    const t = makeTx('2026-04-11', -50, 'Coles Online Pellacombe AUS', { categoryId: 'gifts', manualOverride: true, categorySource: 'user' })
    expect(categoriseOne(t, ctx()).categoryId).toBe('gifts')
  })

  it('uses cached AI answers', () => {
    const t = makeTx('2026-04-11', -30, 'Tidemark Barbers Orrindale AUS')
    const out = categoriseOne(t, ctx({ insights: new Map([[t.merchantKey, insight(t.merchantKey, 'personal-care', 0.9)]]) }))
    expect(out).toMatchObject({ categoryId: 'personal-care', categorySource: 'ai' })
    expect(needsReview(out)).toBe(false)
  })

  it('treats refunds as reducing that shop category and other money in as income', () => {
    expect(categoriseOne(makeTx('2026-04-11', 150, 'CRED VOUCHER Coles Online Pellacombe AUS'), ctx()).categoryId).toBe('groceries')
    expect(categoriseOne(makeTx('2026-04-11', 1000, 'ACME PAYROLL'), ctx()).categoryId).toBe('income')
  })

  it('flags uncertain answers for a quick look', () => {
    const t = makeTx('2026-04-11', -30, 'Mystery Shop AUS')
    const out = categoriseOne(t, ctx({ insights: new Map([[t.merchantKey, insight(t.merchantKey, 'dining', AUTO_ACCEPT - 0.1)]]) }))
    expect(needsReview(out)).toBe(true)
  })
})

describe('merchantsNeedingAi', () => {
  it('sends each unknown merchant once, as cleaned text plus the town the bank listed', () => {
    const txs = [
      makeTx('2026-04-11', -30, 'SP FERNQUIST GOODS NSW AUS'),
      makeTx('2026-04-12', -40, 'SP FERNQUIST GOODS NSW AUS'),
      makeTx('2026-04-12', -40, 'Coles Online Pellacombe AUS'),
      makeTx('2026-04-12', -400, 'OSKO PAYMENT TO JORDAN EXAMPLE'),
      makeTx('2026-04-12', 40, 'SOME REFUND'),
    ]
    expect(merchantsNeedingAi(txs, ctx())).toEqual([{ merchantKey: 'fernquist-goods', text: 'Fernquist Goods', place: 'NSW' }])
  })
})

describe('fallbackClassifier', () => {
  it('makes low-confidence keyword guesses', async () => {
    const [r] = await fallbackClassifier.classify([{ merchantKey: 'x', text: 'Bramblecup Coffee Quill' }], STARTER_CATEGORIES)
    expect(r.categoryId).toBe('cafes')
    expect(r.confidence).toBeLessThan(AUTO_ACCEPT)
  })
})

describe('odd shop names', () => {
  it.each(['19: AU Ref-', '08: AU Ref-', '4471 Orrindale', 'X', '- Payment'])('%s looks odd', (name) => {
    expect(oddShopName(name)).toBe(true)
  })
  it.each(['Netflix', '7-Eleven', 'Tidemark Barbers Orrindale', 'Plum-Wise', 'Up'])('%s is fine', (name) => {
    expect(oddShopName(name)).toBe(false)
  })

  it('asks for a quick look at an odd name until it is renamed or confirmed', () => {
    const t = { ...makeTx('2026-04-11', -50, 'EFTPOS 14/03 19:52 ODD AU REF-1'), merchant: '19: AU Ref-', categoryId: 'software', categorySource: 'builtin' as const, confidence: 0.95 }
    expect(needsReview(t)).toBe(true)
    expect(needsReview({ ...t, merchant: 'Netflix' })).toBe(false)
    expect(needsReview({ ...t, categorySource: 'rule' as const })).toBe(false)
  })
})
