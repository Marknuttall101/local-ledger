import { describe, expect, it } from 'vitest'
import { makeTx } from '../core/testing'
import { monthlyTotals, OTHER, pickSeries } from './chartData'

describe('pickSeries', () => {
  it('keeps the biggest few as their own series and folds the rest into "Other"', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Shop ${i}`, color: '#000' }))
    const series = pickSeries(rows, 8)
    expect(series.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', OTHER])
    expect(series[8].name).toBe('2 others')
    expect(pickSeries(rows.slice(0, 3), 8).map((s) => s.id)).toEqual(['s0', 's1', 's2'])
  })
})

describe('monthlyTotals', () => {
  it('adds up each series per month, with zeros for quiet months, and the rest under Other', () => {
    const txs = [
      makeTx('2026-01-05', -27, 'ZENTROVA CLOUD', { merchantKey: 'zentrova', categoryId: 'software' }),
      makeTx('2026-03-05', -31, 'ZENTROVA CLOUD', { merchantKey: 'zentrova', categoryId: 'software' }),
      makeTx('2026-03-09', -12, 'PLUMWISE APP', { merchantKey: 'plumwise', categoryId: 'software' }),
    ]
    const rows = monthlyTotals(txs, ['2026-01', '2026-02', '2026-03'], (t) => t.merchantKey, ['zentrova', OTHER])
    expect(rows).toEqual([
      { month: '2026-01', zentrova: 27, [OTHER]: 0 },
      { month: '2026-02', zentrova: 0, [OTHER]: 0 },
      { month: '2026-03', zentrova: 31, [OTHER]: 12 },
    ])
  })
})
