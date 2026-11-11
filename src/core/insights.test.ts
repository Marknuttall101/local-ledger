import { describe, expect, it } from 'vitest'
import { breakdownByGroup, fullMonths, monthlySeries, spendOf } from './analytics'
import { STARTER_CATEGORIES, STARTER_GROUPS } from './categories'
import { findFraudFlags } from './fraud'
import { findSavings } from './savings'
import { currentPriceRise, detectSubscriptions } from './subscriptions'
import { makeTx, monthly } from './testing'

describe('analytics', () => {
  it('counts purchases, subtracts refunds and ignores transfers', () => {
    expect(spendOf(makeTx('2026-01-01', -10, 'x', { categoryId: 'groceries' }))).toBe(10)
    expect(spendOf(makeTx('2026-01-01', 4, 'x', { categoryId: 'groceries' }))).toBe(-4)
    expect(spendOf(makeTx('2026-01-01', -500, 'x', { categoryId: 'transfers', isTransfer: true }))).toBe(0)
  })
  it('works out which months are fully covered', () => {
    const txs = [makeTx('2025-09-28', -1, 'a'), makeTx('2026-01-15', -1, 'b'), makeTx('2026-02-20', -1, 'c')]
    expect(fullMonths(txs)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01'])
  })
  it('builds monthly series and group breakdowns', () => {
    const txs = [makeTx('2026-01-02', -30, 'a', { categoryId: 'groceries' }), makeTx('2026-02-02', -10, 'b', { categoryId: 'streaming' })]
    expect(monthlySeries(txs, (t) => t.categoryId)).toEqual([
      { month: '2026-01', total: 30, groceries: 30 },
      { month: '2026-02', total: 10, streaming: 10 },
    ])
    const b = breakdownByGroup(txs, STARTER_CATEGORIES, STARTER_GROUPS)
    expect(b.map((x) => [x.id, x.total])).toEqual([['food', 30], ['entertainment', 10]])
  })
})

describe('findSavings', () => {
  it('totals foreign fees and cash advance costs', () => {
    const txs = [
      makeTx('2026-01-01', -0.94, 'FOREIGN FEE AUD 0.94', { categoryId: 'bank-fees' }),
      makeTx('2026-01-05', -1.04, 'FOREIGN FEE AUD 1.04', { categoryId: 'bank-fees' }),
      makeTx('2026-01-09', -21, 'CASH ADVANCE FEE', { categoryId: 'bank-fees' }),
      makeTx('2026-01-31', -7, 'Coles'),
    ]
    const s = findSavings(txs, [], STARTER_CATEGORIES)
    expect(s.map((x) => x.kind).sort()).toEqual(['cash-advance', 'foreign-fees'])
    expect(s.find((x) => x.kind === 'foreign-fees')!.title).toContain('$1.98')
  })

  it('suggests trimming overlapping streaming services', () => {
    const txs = [
      ...monthly('2026-01-01', 4, -16.49, 'NETFLIX.COM', { categoryId: 'streaming' }),
      ...monthly('2026-01-03', 4, -14, 'DISNEY PLUS', { categoryId: 'streaming' }),
    ]
    const [s] = findSavings(txs, detectSubscriptions(txs), STARTER_CATEGORIES)
    expect(s.kind).toBe('overlapping-subscriptions')
    expect(s.yearlySaving).toBe(168)
  })

  it("doesn't suggest dropping software tools, and only talks about watching for video streaming", () => {
    const software = [
      ...monthly('2026-01-01', 4, -27, 'ZENTROVA CLOUD SUBSCRIPTION', { categoryId: 'software' }),
      ...monthly('2026-01-03', 4, -19, 'PLUMWISE APP', { categoryId: 'software' }),
    ]
    expect(findSavings(software, detectSubscriptions(software), STARTER_CATEGORIES).filter((s) => s.kind === 'overlapping-subscriptions')).toEqual([])

    const music = [
      ...monthly('2026-01-01', 4, -13, 'SPOTIFY', { categoryId: 'music' }),
      ...monthly('2026-01-03', 4, -14, 'APPLE MUSIC', { categoryId: 'music' }),
    ]
    const [m] = findSavings(music, detectSubscriptions(music), STARTER_CATEGORIES)
    expect(m.kind).toBe('overlapping-subscriptions')
    expect(m.detail).not.toContain('watch')

    const video = [
      ...monthly('2026-01-01', 4, -16.49, 'NETFLIX.COM', { categoryId: 'streaming' }),
      ...monthly('2026-01-03', 4, -14, 'DISNEY PLUS', { categoryId: 'streaming' }),
    ]
    expect(findSavings(video, detectSubscriptions(video), STARTER_CATEGORIES)[0].detail).toContain('something to watch')
  })

  it('notices spending creeping up', () => {
    const txs = [
      ...monthly('2026-01-10', 6, -100, 'UBER *EATS', { categoryId: 'takeaway' }),
      ...monthly('2026-07-10', 3, -300, 'UBER *EATS', { categoryId: 'takeaway' }),
      makeTx('2026-01-01', -1, 'start'),
      makeTx('2026-09-30', -1, 'end'),
    ]
    const creep = findSavings(txs, [], STARTER_CATEGORIES).find((s) => s.kind === 'spending-creep')!
    expect(creep.title).toBe('Takeaway & Delivery is up 200% lately')
    expect(creep.yearlySaving).toBe(2400)
  })
})

describe('findFraudFlags', () => {
  const none = new Map()
  it('flags double charges', () => {
    const txs = [makeTx('2026-01-01', -89, 'SHOP ONE AUS', { id: 'a' }), makeTx('2026-01-01', -89, 'SHOP ONE AUS', { id: 'b' })]
    const flags = findFraudFlags(txs, none, none)
    expect(flags.map((f) => f.transactionId)).toEqual(['b'])
  })
  it('flags tiny charges from new merchants and first overseas purchases', () => {
    const txs = [makeTx('2026-01-01', -0.99, 'WEIRDCO AUS', { id: 'tiny' }), makeTx('2026-01-02', -35.5, 'ZYLOQUAD-SHOP-STORE CASTELVARRO ITA', { id: 'overseas' })]
    const flags = findFraudFlags(txs, none, none)
    expect(flags.map((f) => f.transactionId).sort()).toEqual(['overseas', 'tiny'])
    expect(flags.find((f) => f.transactionId === 'overseas')!.reasons[0]).toContain('ITA')
  })
  it('respects "legit" decisions for a transaction or a whole merchant', () => {
    const t = makeTx('2026-01-02', -35.5, 'ZYLOQUAD-SHOP-STORE CASTELVARRO ITA', { id: 'overseas' })
    expect(findFraudFlags([t], none, new Map([['overseas', { key: 'overseas', verdict: 'legit', at: '' }]]))).toEqual([])
    const key = `merchant:${t.merchantKey}`
    expect(findFraudFlags([t], none, new Map([[key, { key, verdict: 'legit', at: '' }]]))).toEqual([])
  })
  it('flags a charge far bigger than usual for that merchant', () => {
    const txs = [...monthly('2026-01-05', 6, -20, 'BRAMBLECUP COFFEE AUS'), makeTx('2026-08-01', -450, 'BRAMBLECUP COFFEE AUS', { id: 'big' })]
    expect(findFraudFlags(txs, none, none).map((f) => f.transactionId)).toContain('big')
  })
})

describe('travel', () => {
  it('does not flag every shop on an overseas trip', () => {
    const trip = ['01', '02', '03', '04', '05'].map((d, i) => makeTx(`2026-05-${d}`, -40, `SHOP NUMBER ${'ABCDE'[i]} CASTELVARRO ITA`))
    expect(findFraudFlags(trip, new Map(), new Map())).toEqual([])
  })
})

describe('AI suspicion', () => {
  it('flags a suspicious shop once, not on every charge', () => {
    const txs = monthly('2026-01-05', 5, -18, 'ODDSHOP AUS')
    const insights = new Map([[txs[0].merchantKey, { merchantKey: txs[0].merchantKey, categoryId: 'uncategorised', confidence: 0, subscriptionLikelihood: 0, suspiciousLikelihood: 0.8, source: 'ai' as const, at: '' }]])
    const flags = findFraudFlags(txs, insights, new Map())
    expect(flags.map((f) => f.transactionId)).toEqual([txs[0].id])
    expect(flags[0].reasons[0]).toContain('5 charges so far')
  })
})

describe('price rises that were undone', () => {
  const netflix = [
    ...monthly('2025-07-12', 3, -10, 'NETFLIX.COM', { categoryId: 'streaming' }),
    ...monthly('2025-10-12', 1, -20, 'NETFLIX.COM', { categoryId: 'streaming' }),
    ...monthly('2025-11-12', 6, -10, 'NETFLIX.COM', { categoryId: 'streaming' }),
  ]

  it("aren't a way to save once the price is back down", () => {
    const [s] = detectSubscriptions(netflix)
    expect(currentPriceRise(s)).toBeUndefined()
    expect(findSavings(netflix, [s], STARTER_CATEGORIES).filter((x) => x.kind === 'price-rise')).toEqual([])
  })

  it('still count while the higher price is being charged', () => {
    const txs = [...monthly('2026-01-07', 3, -55.00, 'SKYLARK MOBILE PTY LTD AUS'), ...monthly('2026-04-07', 3, -62.00, 'SKYLARK MOBILE PTY LTD AUS')]
    const [s] = detectSubscriptions(txs)
    expect(currentPriceRise(s)).toEqual({ date: '2026-04-07', from: 55.00, to: 62.00 })
    expect(findSavings(txs, [s], STARTER_CATEGORIES).some((x) => x.kind === 'price-rise')).toBe(true)
  })
})
