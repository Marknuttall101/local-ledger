import type { Transaction } from './types'

/** Card repayments and moves between your own accounts — never spending */
const TRANSFER_RE =
  /^AUTOMATIC PAYMENT|PAYMENT BY AUTHORITY TO CC PAYMENT|^(WITHDRAWAL|DEPOSIT) (ONLINE|MOBILE) \d+ TFR\b|PAYMENT[ -]+THANK ?YOU|^PAYMENT RECEIVED|^DIRECT DEBIT PAYMENT|CREDIT CARD (RE)?PAYMENT|PAYMENT TO .*CARD|\bCARD REPAYMENT|TRANSFER (TO|FROM) (MY |OWN |SAVINGS|CREDIT CARD|OFFSET)|INTERNAL TRANSFER|BETWEEN ACCOUNTS|^BPAY .*(WESTPAC|COMMBANK|CBA|ANZ|NAB) ?(CARD|CREDIT)/i

export function looksLikeTransfer(rawDescription: string): boolean {
  return TRANSFER_RE.test(rawDescription)
}

const DAY = 86_400_000

/**
 * Money leaving one of your accounts and the same amount arriving in another of your accounts
 * within 3 days is a transfer, e.g. paying off the credit card from the everyday account.
 * Returns ids of transactions that should be marked as transfers.
 */
export function findMatchedTransfers(transactions: Transaction[]): Set<string> {
  const ids = new Set<string>()
  const incoming = transactions.filter((t) => t.amount > 0 && !t.isTransfer)
  const used = new Set<string>()
  for (const out of transactions) {
    if (out.amount >= 0 || out.isTransfer) continue
    const match = incoming.find(
      (inn) =>
        !used.has(inn.id) &&
        inn.accountId !== out.accountId &&
        Math.abs(inn.amount + out.amount) < 0.005 &&
        Math.abs(Date.parse(inn.date) - Date.parse(out.date)) <= 3 * DAY &&
        (Boolean(inn.transferLike) ||
          Boolean(out.transferLike) ||
          looksLikeTransfer(inn.rawDescription) ||
          looksLikeTransfer(out.rawDescription) ||
          /TRANSFER|PAYMENT|BPAY|CARD/i.test(out.rawDescription)),
    )
    if (match) {
      used.add(match.id)
      ids.add(match.id)
      ids.add(out.id)
    }
  }
  return ids
}

/**
 * A transfer or payment to/from someone with the account holder's own name, e.g. for holder
 * "ALEX SAMPLE": "WITHDRAWAL-OSKO PAYMENT 3100001 Alex S Savings", "PYMT Alex Sampl",
 * "DEPOSIT-OSKO PAYMENT 3100003 Alex B Sample".
 */
export function isOwnNamePayment(description: string, holderName: string): boolean {
  if (!/\b(OSKO|PAYID|TFR|PYMT|TRANSFER|DEPOSIT|WITHDRAWAL)\b/i.test(description)) return false
  const [first, ...rest] = holderName.toUpperCase().split(/\s+/)
  const surname = rest[rest.length - 1]
  if (!first || !surname) return false
  const words = description.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] !== first) continue
    let j = i + 1
    // optional middle initial, unless it is the surname's initial ("Alex S Savings")
    if (words[j].length === 1 && words[j] !== surname[0] && j + 1 < words.length) j++
    const w = words[j]
    if (surname.startsWith(w) && (w.length >= 4 || w === surname || w.length === 1)) return true
  }
  return false
}
