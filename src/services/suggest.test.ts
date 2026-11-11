import { describe, expect, it } from 'vitest'
import type { Classifier } from '../core/categorise'
import { makeTx } from '../core/testing'
import type { Category } from '../core/types'
import { candidateShops, suggestForCategory } from './suggest'

const pottery: Category = { id: 'pottery', groupId: 'lifestyle', name: 'Pottery', hint: 'Pottery classes, studios and clay supplies' }
const cats: Category[] = [pottery, { id: 'dining', groupId: 'food', name: 'Dining Out', hint: 'Restaurants' }]

const txs = [
  makeTx('2026-05-02', -74, 'EFTPOS DEBIT 1112222 GLOAMWICK POTTERY NSW', { categoryId: 'dining' }),
  makeTx('2026-05-03', -58, 'EFTPOS DEBIT 1112222 GLOAMWICK POTTERY NSW', { categoryId: 'dining' }),
  makeTx('2026-05-04', -27, 'EFTPOS DEBIT 9371046 BRAMBLECUP CAFE ORRINDALE', { categoryId: 'dining' }),
  makeTx('2026-05-05', -45, 'WITHDRAWAL-OSKO PAYMENT 3100001 Jordan Example pottery money', { categoryId: 'uncategorised' }),
  makeTx('2026-05-06', 420, 'DEPOSIT SALARY', { categoryId: 'income' }),
]

describe('suggesting shops for a new category', () => {
  it('never offers payments to people, and puts the biggest spend first', () => {
    const shops = candidateShops(txs, 'pottery')
    expect(shops.map((s) => s.merchant)).toEqual(['Gloamwick Pottery', 'Bramblecup Cafe Orrindale'])
    expect(shops[0]).toMatchObject({ transactions: 2, spend: 132 })
  })

  it('suggests the shops the AI now puts in the new category', async () => {
    const ai: Classifier = {
      name: 'ai',
      async classify(items) {
        return items.map((i) => ({ merchantKey: i.merchantKey, categoryId: /pottery/i.test(i.text) ? 'pottery' : 'dining', confidence: 0.8, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai' as const }))
      },
    }
    const out = await suggestForCategory(pottery, txs, cats, ai)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ merchant: 'Gloamwick Pottery', reason: 'ai', currentCategoryId: 'dining' })
  })

  it('falls back to matching names when the AI is offline', async () => {
    const offline: Classifier = {
      name: 'fallback',
      async classify(items) {
        return items.map((i) => ({ merchantKey: i.merchantKey, categoryId: 'dining', confidence: 0.3, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'fallback' as const }))
      },
    }
    const out = await suggestForCategory(pottery, txs, cats, offline)
    expect(out.map((s) => [s.merchant, s.reason])).toEqual([['Gloamwick Pottery', 'name']])
  })
})

describe('what Find shops may send', () => {
  it('never asks about shops the built-in list already recognises', async () => {
    const withKnown = [
      ...txs,
      makeTx('2026-05-07', -16.49, 'NETFLIX.COM AUS', { categoryId: 'streaming', categorySource: 'builtin' }),
      makeTx('2026-05-08', -61.3, 'WOOLWORTHS 3318 QUILLMERE', { categoryId: 'groceries', categorySource: 'builtin' }),
    ]
    const sent: string[] = []
    const ai: Classifier = {
      name: 'ai',
      async classify(items) {
        sent.push(...items.map((i) => i.text))
        return items.map((i) => ({ merchantKey: i.merchantKey, categoryId: 'dining', confidence: 0.8, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai' as const }))
      },
    }
    await suggestForCategory(pottery, withKnown, cats, ai)
    expect(sent).toEqual(['Gloamwick Pottery', 'Bramblecup Cafe Orrindale'])
  })
})
