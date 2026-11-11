import type { NameKeyword } from './types'

/** Words banks add around a shop's name; never a good key word on their own */
const NOT_A_SHOP = new Set(
  (
    'EFTPOS POS VISA MASTERCARD DEBIT CREDIT PURCHASE CARD PAYMENT PAYMENTS AUTHORITY DIRECT TRANSFER TFR ' +
    'WITHDRAWAL DEPOSIT ONLINE MOBILE INTERNET BANKING RECURRING FEE FEES REFUND VALUE DATE FRGN AMT ' +
    'PAYPAL AUS AUD USA GBR NZL PTY LTD LIMITED INC LLC INV REF THE AND FOR ' +
    'SYDNEY MELBOURNE BRISBANE PERTH ADELAIDE HOBART CANBERRA DARWIN GOLD COAST NSW VIC QLD TAS NORTH SOUTH EAST WEST ' +
    'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'
  ).split(' '),
)

/**
 * The word in a bank description most likely to be the shop: the longest one that isn't bank
 * wording, a place, a month or a number. "EFTPOS 14/03 19:52ZENTROVA AU REF-4417" → "ZENTROVA".
 */
export function suggestKeyword(raw: string): string {
  const words = raw
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w.length >= 3 && !NOT_A_SHOP.has(w))
  let best = ''
  for (const w of words) if (w.length > best.length) best = w
  return best
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether the bank's wording contains the key word as a word of its own (numbers may touch it) */
export function matchesKeyword(raw: string, keyword: string): boolean {
  const k = keyword.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!k) return false
  return new RegExp(`(?<![A-Z])${escape(k).replace(/ /g, '\\s+')}(?![A-Z])`).test(raw.toUpperCase())
}

/** The key-word rename that applies to this wording; the longest key word wins */
export function keywordFor(raw: string, rules: NameKeyword[]): NameKeyword | undefined {
  let best: NameKeyword | undefined
  for (const r of rules) if (matchesKeyword(raw, r.keyword) && (!best || r.keyword.length > best.keyword.length)) best = r
  return best
}
