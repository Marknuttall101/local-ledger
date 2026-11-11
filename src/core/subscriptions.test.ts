import { describe, expect, it } from 'vitest'
import { detectSubscriptions, overlappingSubscriptions } from './subscriptions'
import { makeTx, monthly } from './testing'

describe('detectSubscriptions', () => {
  it('finds a monthly charge and its yearly cost', () => {
    const subs = detectSubscriptions(monthly('2026-01-23', 6, -10.49, 'PRIME VIDE* PRIME VIDE QUILLMERE AUS', { categoryId: 'streaming' }))
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ merchant: 'Prime Video', cadence: 'monthly', amount: 10.49, yearlyCost: 125.88, active: true, charges: 6 })
  })

  it('does not count a regular cash withdrawal as a subscription', () => {
    expect(detectSubscriptions(monthly('2026-01-12', 6, -50, 'ATM WITHDRAWAL 4471 ORRINDALE', { categoryId: 'cash' }))).toEqual([])
  })

  it('spots a price rise', () => {
    const txs = [...monthly('2026-01-07', 3, -55.00, 'SKYLARK MOBILE PTY LTD AUS'), ...monthly('2026-04-07', 3, -62.00, 'SKYLARK MOBILE PTY LTD AUS')]
    const [s] = detectSubscriptions(txs)
    expect(s.priceChanges).toEqual([{ date: '2026-04-07', from: 55.00, to: 62.00 }])
    expect(s.amount).toBe(62.00)
  })

  it('ignores irregular shopping', () => {
    const txs = ['2026-01-02', '2026-01-05', '2026-01-19', '2026-02-01', '2026-02-03'].map((d, i) => makeTx(d, -47 - i * 11, 'Coles Online Pellacombe AUS'))
    expect(detectSubscriptions(txs)).toEqual([])
  })

  it('finds the regular charge hidden among other purchases from the same shop', () => {
    const txs = [
      ...monthly('2026-01-13', 5, -8.49, 'AMAZON AU MARKETPLACE AUS'),
      makeTx('2026-01-22', -71.35, 'AMAZON AU MARKETPLACE AUS'),
      makeTx('2026-03-04', -23.9, 'AMAZON AU MARKETPLACE AUS'),
    ]
    const [s] = detectSubscriptions(txs)
    expect(s).toMatchObject({ amount: 8.49, cadence: 'monthly', charges: 5 })
  })

  it('marks a subscription that stopped as inactive', () => {
    const txs = [...monthly('2025-01-01', 4, -11, 'DISNEY PLUS'), makeTx('2026-01-01', -44, 'Coles')]
    expect(detectSubscriptions(txs)[0].active).toBe(false)
  })

  it('groups overlapping services', () => {
    const subs = detectSubscriptions([
      ...monthly('2026-01-01', 4, -16.49, 'NETFLIX.COM', { categoryId: 'streaming' }),
      ...monthly('2026-01-03', 4, -14.49, 'DISNEY PLUS', { categoryId: 'streaming' }),
      ...monthly('2026-01-04', 4, -12.49, 'SPOTIFY', { categoryId: 'music' }),
    ])
    const groups = overlappingSubscriptions(subs)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ categoryId: 'streaming', monthlyCost: 30.98 })
  })
})

describe('variable bills', () => {
  it('does not report price rises for bills that change every time', () => {
    const bills: Array<[string, number]> = [
      ['2026-01-18', 231.4],
      ['2026-04-18', 268.9],
      ['2026-07-18', 252.6],
      ['2026-10-18', 317.2],
    ]
    const [s] = detectSubscriptions(bills.map(([d, a]) => makeTx(d, -a, 'BRIGHTCOIL ENERGY BILLING')))
    expect(s.cadence).toBe('quarterly')
    expect(s.priceChanges).toEqual([])
  })
})
