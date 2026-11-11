import { cleanMerchant } from './clean'
import type { ParsedTransaction } from './types'

/**
 * Same day, same amount, same shop. Using the cleaned shop rather than the exact wording means
 * a PDF and a CSV of the same account (which word things slightly differently) still match, and
 * stored transactions are matched by their saved shop key, which survives changes to the
 * cleaning rules.
 */
const fingerprint = (t: Pick<ParsedTransaction, 'date' | 'amount' | 'rawDescription'> & { merchantKey?: string }, keyOf: (raw: string) => string) =>
  `${t.date}|${t.amount.toFixed(2)}|${t.rawDescription ? keyOf(t.rawDescription) : t.merchantKey}`

/**
 * Drop rows already stored for this account (overlapping statements), while keeping genuine
 * repeats: two identical coffees on the same day in one file are both kept, and only as many
 * copies as already exist are treated as duplicates.
 */
export function removeDuplicates<T extends ParsedTransaction>(
  incoming: T[],
  existing: Array<ParsedTransaction & { merchantKey?: string }>,
  /** How a shop's key is worked out from the bank's wording (the same way it was when stored) */
  keyOf: (raw: string) => string = (raw) => cleanMerchant(raw).key,
): { fresh: T[]; duplicates: number } {
  const available = new Map<string, number>()
  for (const e of existing) available.set(fingerprint(e, keyOf), (available.get(fingerprint(e, keyOf)) ?? 0) + 1)
  const fresh: T[] = []
  let duplicates = 0
  for (const t of incoming) {
    const key = fingerprint(t, keyOf)
    const n = available.get(key) ?? 0
    if (n > 0) {
      available.set(key, n - 1)
      duplicates++
    } else fresh.push(t)
  }
  return { fresh, duplicates }
}
