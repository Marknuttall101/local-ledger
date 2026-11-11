import { cleanMerchant } from './clean'
import type { Transaction } from './types'

let n = 0
/** Build a stored transaction for tests and sample data */
export function makeTx(date: string, amount: number, rawDescription: string, extra: Partial<Transaction> = {}): Transaction {
  const { name, key } = cleanMerchant(rawDescription)
  return {
    id: extra.id ?? `t${++n}`,
    accountId: 'acc',
    importId: 'imp',
    date,
    amount,
    rawDescription,
    merchant: name,
    merchantKey: key,
    categoryId: 'uncategorised',
    categorySource: 'fallback',
    confidence: 0,
    isTransfer: false,
    ...extra,
  }
}

export const monthly = (start: string, count: number, amount: number, raw: string, extra: Partial<Transaction> = {}) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(start)
    d.setUTCMonth(d.getUTCMonth() + i)
    return makeTx(d.toISOString().slice(0, 10), amount, raw, extra)
  })
