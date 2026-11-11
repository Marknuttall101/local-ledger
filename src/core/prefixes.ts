/**
 * Bank wording that wraps the real shop or person in a description, e.g.
 * "DEBIT CARD PURCHASE Pellacombe Bakery" or "PAYMENT BY AUTHORITY TO ORRINDALE GYM 7700000-0".
 */
const BANK_PREFIXES: RegExp[] = [
  /^(CRED(IT)? VOUCHER|REFUND|RETURN|REVERSAL( OF)?)\s+/i,
  /^DEBIT CARD (PURCHASE|REFUND)\s+/i,
  /^EFTPOS (DEBIT|CREDIT|PURCHASE)\s+(\d+\s+)?/i,
  // NAB card purchases: "EFTPOS 14/03 19:52ZENTROVA AU ..." (the time can run straight into the shop)
  /^(EFTPOS|POS)\s+\d{1,2}\/\d{1,2}(\s+\d{1,2}:\d{2})?\s*/i,
  /^PAYMENT BY AUTHORITY TO\s+/i,
  /^(WITHDRAWAL|DEPOSIT)-OSKO PAYMENT\s+\d+\s+/i,
  /^(WITHDRAWAL|DEPOSIT) (ONLINE|MOBILE)\s+\d+\s+(TFR|PYMT)\s+/i,
  /^DEPOSIT-SALARY\s+/i,
  /^(DEPOSIT|WITHDRAWAL)\s+(\d+\s+)?(INTL\s+)?/i,
  /^VISA PURCHASE\s+/i,
]

/** Remove the bank's wording so only the shop or person is left */
export function stripBankPrefix(raw: string): string {
  let s = raw.trim()
  for (const re of BANK_PREFIXES) s = s.replace(re, '')
  return s
}

/** Payments between people (Osko, PayID, Beem, transfers) — may contain someone's name */
export const PERSON_PAYMENT = /\b(OSKO|PAYID|PAY ?ANYONE|BEEM|FAST PAYMENT)\b|^(WITHDRAWAL|DEPOSIT)\s+(\d+\s+)?(INTL\s+)?[A-Z]|\b(TFR|PYMT)\b/i

/** Direct debits and card purchases are always to businesses */
export const BUSINESS_PAYMENT = /^(PAYMENT BY AUTHORITY TO|DEBIT CARD (PURCHASE|REFUND)|EFTPOS (DEBIT|PURCHASE)|VISA PURCHASE)\b/i
