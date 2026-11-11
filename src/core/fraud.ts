import { factsOf } from './facts'
import type { FraudDecision, MerchantInsight, Transaction } from './types'

export interface FraudFlag {
  transactionId: string
  reasons: string[]
  /** Higher = more worth a look */
  score: number
}

const DAY = 86_400_000
const BANK_ROWS = /^(FOREIGN FEE|CASH ADVANCE FEE|INTEREST|CARD FEE|ANNUAL FEE|REWARDS FEE)/i

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/**
 * Point out charges worth a second look. Deliberately conservative: every flag says why,
 * and anything the user has marked legit (per transaction or per merchant) is left out.
 */
export function findFraudFlags(
  transactions: Transaction[],
  insights: Map<string, MerchantInsight>,
  decisions: Map<string, FraudDecision>,
): FraudFlag[] {
  const spend = transactions
    .filter((t) => t.amount < 0 && !t.isTransfer && !BANK_ROWS.test(t.rawDescription))
    .sort((a, b) => a.date.localeCompare(b.date))
  const flags = new Map<string, FraudFlag>()
  const flag = (t: Transaction, reason: string, score: number) => {
    const f = flags.get(t.id) ?? { transactionId: t.id, reasons: [], score: 0 }
    f.reasons.push(reason)
    f.score += score
    flags.set(t.id, f)
  }

  const byMerchant = new Map<string, Transaction[]>()
  for (const t of spend) {
    if (!byMerchant.has(t.merchantKey)) byMerchant.set(t.merchantKey, [])
    byMerchant.get(t.merchantKey)!.push(t)
  }

  // Overseas purchases on a trip (or regular overseas online shopping) are normal, so a first
  // overseas purchase is only worth a look when it stands alone
  const overseasDays = spend.filter(isOverseas).map((t) => Date.parse(t.date))
  const onATrip = (t: Transaction) => overseasDays.filter((d) => Math.abs(d - Date.parse(t.date)) <= 7 * DAY).length >= 4

  for (const [, list] of byMerchant) {
    list.forEach((t, i) => {
      const amount = -t.amount
      // 1. Same amount, same merchant, within a day
      const prev = list[i - 1]
      if (prev && amount >= 20 && prev.amount === t.amount && Date.parse(t.date) - Date.parse(prev.date) <= DAY) {
        flag(t, `Charged ${money(amount)} twice by ${t.merchant}`, 3)
      }
      const isFirst = i === 0
      const country = factsOf(t).country
      // 2. First time at an overseas merchant, when not travelling
      if (isFirst && isOverseas(t) && amount >= 5 && !onATrip(t)) flag(t, `First purchase from an overseas merchant${country && country !== 'AUS' ? ` (${country})` : ''}`, 1)
      // 3. Much bigger than usual for this merchant
      const history = list.slice(0, i).map((x) => -x.amount)
      if (history.length >= 6 && amount >= 100 && amount > 2 * Math.max(...history) && amount > 4 * median(history)) {
        flag(t, `Much larger than your usual ${t.merchant} spend (usually about ${money(median(history))})`, 2)
      }
      // 4. Tiny charge from a brand-new merchant — a common card-testing pattern
      if (list.length === 1 && amount < 2 && amount > 0) flag(t, 'Tiny charge from a merchant you have not used before', 2)
    })
  }

  // 5. The AI thinks the merchant looks suspicious — flagged once, on the first charge
  for (const [key, list] of byMerchant) {
    if ((insights.get(key)?.suspiciousLikelihood ?? 0) >= 0.7) {
      flag(list[0], `The AI thinks this merchant looks unusual${list.length > 1 ? ` (${list.length} charges so far)` : ''}`, 2)
    }
  }

  const byId = new Map(transactions.map((t) => [t.id, t]))
  return [...flags.values()]
    .filter((f) => {
      const t = byId.get(f.transactionId)!
      return decisions.get(f.transactionId)?.verdict !== 'legit' && decisions.get(`merchant:${t.merchantKey}`)?.verdict !== 'legit'
    })
    .sort((a, b) => b.score - a.score)
}

function isOverseas(t: Transaction): boolean {
  const country = factsOf(t).country
  return Boolean(t.foreign) || (country !== undefined && country !== 'AUS')
}

const money = (n: number) => `$${n.toFixed(2)}`
