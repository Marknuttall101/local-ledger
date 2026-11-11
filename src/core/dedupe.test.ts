import { describe, expect, it } from 'vitest'
import { removeDuplicates } from './dedupe'
import { findMatchedTransfers, looksLikeTransfer } from './transfers'
import type { Transaction } from './types'

const p = (date: string, amount: number, rawDescription = 'BRAMBLECUP COFFEE') => ({ date, amount, rawDescription })

describe('removeDuplicates', () => {
  it('skips rows already imported from an overlapping statement', () => {
    const existing = [p('2026-09-01', -5), p('2026-09-02', -10)]
    const { fresh, duplicates } = removeDuplicates([p('2026-09-02', -10), p('2026-09-03', -7)], existing)
    expect(fresh).toEqual([p('2026-09-03', -7)])
    expect(duplicates).toBe(1)
  })
  it('keeps two genuine identical purchases on the same day', () => {
    const { fresh } = removeDuplicates([p('2026-09-01', -5), p('2026-09-01', -5)], [])
    expect(fresh).toHaveLength(2)
  })
  it('only treats as many copies as already exist as duplicates', () => {
    const { fresh } = removeDuplicates([p('2026-09-01', -5), p('2026-09-01', -5)], [p('2026-09-01', -5)])
    expect(fresh).toHaveLength(1)
  })
})

const tx = (id: string, accountId: string, date: string, amount: number, rawDescription: string): Transaction => ({
  id, accountId, date, amount, rawDescription, importId: 'i', merchant: '', merchantKey: '', categoryId: '', categorySource: 'rule', confidence: 1, isTransfer: false,
})

describe('transfers', () => {
  it('recognises card repayments', () => {
    expect(looksLikeTransfer('AUTOMATIC PAYMENT')).toBe(true)
    expect(looksLikeTransfer('PAYMENT - THANK YOU')).toBe(true)
    expect(looksLikeTransfer('COLES 0719')).toBe(false)
  })
  it('pairs money out of one account with the same money into another', () => {
    const ids = findMatchedTransfers([
      tx('a', 'everyday', '2026-06-24', -500, 'PAYMENT TO CREDIT CARD'),
      tx('b', 'card', '2026-06-25', 500, 'AUTOMATIC PAYMENT'),
      tx('c', 'everyday', '2026-06-24', -63.2, 'COLES'),
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })
})

import { isOwnNamePayment } from './transfers'
import { cleanMerchant, merchantTextForAi, mayContainPersonalName, personName } from './clean'

describe('everyday account descriptions', () => {
  it('spots payments to and from the account holder', () => {
    expect(isOwnNamePayment('WITHDRAWAL-OSKO PAYMENT 3100001 Alex S Savings', 'ALEX SAMPLE')).toBe(true)
    expect(isOwnNamePayment('WITHDRAWAL MOBILE 3100002 PYMT Alex Sampl 000000000000000', 'ALEX SAMPLE')).toBe(true)
    expect(isOwnNamePayment('DEPOSIT-OSKO PAYMENT 3100003 Alex B Sample', 'ALEX SAMPLE')).toBe(true)
    expect(isOwnNamePayment('DEPOSIT-OSKO PAYMENT 3100004 PAT SAMPLE Alex lunch', 'ALEX SAMPLE')).toBe(false)
    expect(isOwnNamePayment('DEBIT CARD PURCHASE Alexanders Samples AUS', 'ALEX SAMPLE')).toBe(false)
  })
  it('recognises card repayments and own-account transfers', () => {
    for (const d of ['PAYMENT BY AUTHORITY TO CC PAYMENT 9000000000000009QX', 'WITHDRAWAL MOBILE 3100005 TFR Savings', 'DEPOSIT ONLINE 3100006 TFR Savings'])
      expect(looksLikeTransfer(d)).toBe(true)
  })
  it('cleans bank wording off shop names', () => {
    expect(cleanMerchant('DEBIT CARD PURCHASE Spotify Premium Varnholt AUS').name).toBe('Spotify')
    expect(cleanMerchant('PAYMENT BY AUTHORITY TO IRONFERN GYM 7700000-0').name).toBe('Ironfern Gym')
    expect(cleanMerchant('PAYMENT BY AUTHORITY TO BRIGHTCOIL ENERGY DR770000000').name).toBe('Brightcoil Energy')
    expect(cleanMerchant('PAYMENT BY AUTHORITY TO Varnholt Water VRNWTR4400000000').name).toBe('Varnholt Water')
  })
  it('groups each person’s payments under their name', () => {
    expect(cleanMerchant('DEPOSIT-OSKO PAYMENT 3100007 Casey K Example 12 MAR 2026').key).toBe(cleanMerchant('DEPOSIT-OSKO PAYMENT 3100008 Casey K Example').key)
    expect(cleanMerchant('DEPOSIT-OSKO PAYMENT 3100004 PAT SAMPLE Alex lunch 01 JUN 2026').name).toBe('Pat Sample')
    expect(personName('J Q DOE from Chris and Dana')).toBe('J Q DOE')
    expect(personName('MISS JANE ANN CITIZEN Jay tickets')).toBe('JANE ANN')
  })
  it('never sends payments to people to the AI, but does send direct debits to businesses', () => {
    expect(mayContainPersonalName('WITHDRAWAL-OSKO PAYMENT 3100009 JC Example 02 FEB 2026')).toBe(true)
    expect(mayContainPersonalName('EFTPOS DEBIT 3100010 Beem 0000aaaa0000bb')).toBe(true)
    expect(mayContainPersonalName('PAYMENT BY AUTHORITY TO BRIGHTCOIL ENERGY- DDR E7700000000')).toBe(false)
    expect(merchantTextForAi('Gloamwick Hall Events Casey And Alex Booking')).toBe('Gloamwick Hall Events Casey')
  })
})
