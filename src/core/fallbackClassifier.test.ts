import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { STARTER_CATEGORIES } from './categories'
import { cleanMerchant } from './clean'
import { guessCategory } from './fallbackClassifier'
import { decide } from './readers/generic'
import { detectSubscriptions, isBill } from './subscriptions'
import type { Transaction } from './types'

const ids = new Set(STARTER_CATEGORIES.map((c) => c.id))

describe('on-device guesses for everyday bills', () => {
  it.each([
    ['TALLOWMERE PROPERTY RENT 7720', 'rent'],
    ['STRATA LEVY PLAN 4411', 'rent'],
    ['CORMORANT MUTUAL INSURE 55190', 'insurance'],
    ['SKYLARK MOBILE PELLACOMBE AUS', 'internet'],
    ['METROLINK FARES VARNHOLT AUS', 'public-transport'],
    ['BRIGHTCOIL ENERGY BILLING', 'utilities'],
  ])('%s → %s', (text, expected) => {
    expect(guessCategory(text, ids).categoryId).toBe(expected)
  })

  it('does not take a hire car for rent', () => {
    expect(guessCategory('BUDGET RENT A CAR SYDNEY', ids).categoryId).not.toBe('rent')
  })

  it('puts most of the example statements into real categories without a key', () => {
    const shops = new Set<string>()
    for (const path of ['examples/sample-everyday-account.csv', 'examples/sample-credit-card.csv']) {
      const rows = Papa.parse<string[]>(readFileSync(path, 'utf8').trim(), { skipEmptyLines: true }).data
      const d = decide(rows, { kind: 'csv', fileName: path })
      if (d.status !== 'recognised') throw new Error(`${path} not read`)
      for (const t of d.statement.transactions) if (t.amount < 0) shops.add(cleanMerchant(t.rawDescription).name)
    }
    for (const shop of ['Tallowmere Property Rent', 'Cormorant Mutual Insure', 'Skylark Mobile Pellacombe', 'Metrolink Fares Varnholt', 'Brightcoil Energy Billing']) {
      expect(shops).toContain(shop)
      expect(guessCategory(shop, ids).categoryId).not.toBe('uncategorised')
    }
  })
})

describe('rent is a bill, never a subscription', () => {
  it('a monthly rent payment is found as a regular bill and left out of subscriptions', () => {
    const rent: Transaction[] = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      accountId: 'a',
      importId: 'i',
      date: `2026-0${i + 1}-02`,
      rawDescription: 'TALLOWMERE PROPERTY RENT 7720',
      amount: -2450,
      merchant: 'Tallowmere Property Rent',
      merchantKey: 'tallowmere-property-rent',
      categoryId: guessCategory('TALLOWMERE PROPERTY RENT 7720', ids).categoryId,
      categorySource: 'fallback',
      confidence: 0.55,
      isTransfer: false,
    }))
    const found = detectSubscriptions(rent)
    expect(found).toHaveLength(1)
    expect(isBill(found[0])).toBe(true)
    expect(found.filter((s) => s.active && !isBill(s))).toHaveLength(0)
  })
})
