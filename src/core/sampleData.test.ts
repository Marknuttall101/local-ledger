import { describe, expect, it } from 'vitest'
import { categoriseAll, merchantsNeedingAi } from './categorise'
import { STARTER_CATEGORIES } from './categories'
import { cleanMerchant } from './clean'
import { SAMPLE_INSIGHTS, generateSampleStatements } from './sampleData'
import { makeTx } from './testing'

describe('sample data', () => {
  const statements = generateSampleStatements()
  const txs = statements.flatMap((s, i) => s.transactions.map((t) => makeTx(t.date, t.amount, t.rawDescription, { accountId: `a${i}`, foreign: t.foreign })))

  it('is identical every time', () => {
    expect(generateSampleStatements()).toEqual(statements)
  })

  it('has a year of data across two accounts', () => {
    expect(statements).toHaveLength(2)
    expect(txs.length).toBeGreaterThan(400)
  })

  it('never needs the AI: every unknown merchant has a prepared answer', () => {
    const ctx = { rules: new Map(), insights: new Map(), categoryIds: new Set(STARTER_CATEGORIES.map((c) => c.id)) }
    const missing = merchantsNeedingAi(categoriseAll(txs, ctx), ctx)
      .map((m) => m.merchantKey)
      .filter((k) => !SAMPLE_INSIGHTS[k])
    expect(missing).toEqual([])
  })

  it('keeps shop names for generic built-in matches', () => {
    expect(cleanMerchant('QUILLMERE PHYSIO AUS').name).toBe('Quillmere Physio')
  })
})
