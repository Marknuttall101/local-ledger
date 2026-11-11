import { SUBSCRIPTION_MERCHANTS } from './merchants'
import type { MerchantInsight, Transaction } from './types'

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'

const CADENCES: Array<{ cadence: Cadence; days: number; min: number; max: number; perYear: number }> = [
  { cadence: 'weekly', days: 7, min: 6, max: 8, perYear: 52 },
  { cadence: 'fortnightly', days: 14, min: 12, max: 16, perYear: 26 },
  { cadence: 'monthly', days: 30.4, min: 25, max: 36, perYear: 12 },
  { cadence: 'quarterly', days: 91, min: 80, max: 100, perYear: 4 },
  { cadence: 'yearly', days: 365, min: 340, max: 390, perYear: 1 },
]

export interface PriceChange {
  date: string
  from: number
  to: number
}

export interface Subscription {
  merchantKey: string
  merchant: string
  categoryId: string
  cadence: Cadence
  /** Latest charge amount, as a positive number */
  amount: number
  monthlyCost: number
  yearlyCost: number
  firstDate: string
  lastDate: string
  nextExpected: string
  /** Still being charged, as of the latest date in the data */
  active: boolean
  charges: number
  priceChanges: PriceChange[]
  transactionIds: string[]
}

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const round2 = (n: number) => Math.round(n * 100) / 100
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10)

/** Shops the built-in list or the engine thinks are subscription services */
export function subscriptionHints(insights: Iterable<MerchantInsight>): Set<string> {
  const hints = new Set<string>(SUBSCRIPTION_MERCHANTS)
  for (const i of insights) if (i.subscriptionLikelihood >= 0.6) hints.add(i.merchantKey)
  return hints
}

/** Look for a regular rhythm in one set of charges (oldest first) */
function detectRhythm(charges: Transaction[], knownSubscription: boolean): (typeof CADENCES)[number] | undefined {
  if (charges.length < 2) return undefined
  const gaps = charges.slice(1).map((t, i) => days(charges[i].date, t.date))
  const typical = median(gaps)
  const band = CADENCES.find((c) => typical >= c.min && typical <= c.max)
  if (!band) return undefined
  const onRhythm = gaps.filter((g) => g >= band.min && g <= band.max).length / gaps.length
  // Two charges are enough for a known service or yearly billing; otherwise want three
  const enough = charges.length >= 3 || knownSubscription || band.cadence === 'yearly'
  return enough && onRhythm >= 0.6 ? band : undefined
}

/** Charges whose amounts are similar (within 25% of the typical amount) */
function similarAmounts(charges: Transaction[]): boolean {
  const amounts = charges.map((t) => -t.amount)
  const typical = median(amounts)
  return amounts.filter((a) => Math.abs(a - typical) <= typical * 0.25).length / amounts.length >= 0.7
}

/**
 * Find regular recurring charges — the "you're still paying for that streaming service" view.
 * `subscriptionHints` holds merchant keys the built-in list or AI thinks are subscription services.
 */
export function detectSubscriptions(transactions: Transaction[], subscriptionHints: Set<string> = new Set()): Subscription[] {
  // Cash withdrawals can be just as regular (a weekly ATM habit) but aren't a service being paid for
  const spend = transactions.filter((t) => t.amount < 0 && !t.isTransfer && t.categoryId !== 'cash')
  if (!spend.length) return []
  const latest = transactions.reduce((m, t) => (t.date > m ? t.date : m), '')

  const byMerchant = new Map<string, Transaction[]>()
  for (const t of spend) {
    if (!byMerchant.has(t.merchantKey)) byMerchant.set(t.merchantKey, [])
    byMerchant.get(t.merchantKey)!.push(t)
  }

  const found: Subscription[] = []
  for (const [key, all] of byMerchant) {
    const charges = [...all].sort((a, b) => a.date.localeCompare(b.date))
    const hinted = subscriptionHints.has(key)
    // Try the whole set, then (for shops with lots of other purchases) the most common amount alone
    let set = charges
    let rhythm = similarAmounts(set) ? detectRhythm(set, hinted) : undefined
    if (!rhythm) {
      const byAmount = new Map<string, Transaction[]>()
      for (const t of charges) {
        const k = t.amount.toFixed(2)
        if (!byAmount.has(k)) byAmount.set(k, [])
        byAmount.get(k)!.push(t)
      }
      const biggest = [...byAmount.values()].sort((a, b) => b.length - a.length)[0]
      if (biggest.length >= 3 && biggest.length < charges.length) {
        set = biggest
        rhythm = detectRhythm(set, hinted)
      }
    }
    if (!rhythm) continue

    const priceChanges: PriceChange[] = []
    // Bills that vary every time (electricity, water) have no single "price" to track
    const distinct = new Set(set.map((t) => t.amount.toFixed(2))).size
    const fixedPrice = distinct <= Math.max(2, Math.floor(set.length / 3))
    for (let i = 1; fixedPrice && i < set.length; i++) {
      const from = -set[i - 1].amount
      const to = -set[i].amount
      // Ignore tiny wobbles from currency conversion
      if (Math.abs(to - from) > Math.max(0.5, from * 0.03)) priceChanges.push({ date: set[i].date, from, to })
    }
    const last = set[set.length - 1]
    const amount = -last.amount
    const perYear = rhythm.perYear
    found.push({
      merchantKey: key,
      merchant: last.merchant,
      categoryId: last.categoryId,
      cadence: rhythm.cadence,
      amount: round2(amount),
      monthlyCost: round2((amount * perYear) / 12),
      yearlyCost: round2(amount * perYear),
      firstDate: set[0].date,
      lastDate: last.date,
      nextExpected: addDays(last.date, Math.round(rhythm.days)),
      active: days(last.date, latest) <= rhythm.max * 1.5,
      charges: set.length,
      priceChanges,
      transactionIds: set.map((t) => t.id),
    })
  }
  return found.sort((a, b) => Number(b.active) - Number(a.active) || b.yearlyCost - a.yearlyCost)
}

/**
 * The latest price rise, but only while it's still in effect: a price that went up for a month
 * and then came back down isn't costing anything now. `to` is today's price.
 */
export function currentPriceRise(s: Subscription): PriceChange | undefined {
  const rise = s.priceChanges.filter((p) => p.to > p.from).at(-1)
  if (!rise || s.amount - rise.from <= Math.max(0.5, rise.from * 0.03)) return undefined
  return { ...rise, to: s.amount }
}

/** Regular payments that are bills rather than subscriptions you could cancel */
export const BILL_CATEGORIES = new Set(['rent', 'utilities', 'insurance', 'government', 'interest', 'bank-fees'])

export const isBill = (s: Subscription) => BILL_CATEGORIES.has(s.categoryId)

export interface OverlapGroup {
  categoryId: string
  subscriptions: Subscription[]
  monthlyCost: number
}

/**
 * Categories with several active subscriptions, e.g. three streaming services. Software isn't
 * included: different tools usually do different jobs, so having several isn't overlap.
 */
export function overlappingSubscriptions(subs: Subscription[], categories = ['streaming', 'music', 'fitness', 'games']): OverlapGroup[] {
  return categories
    .map((categoryId) => {
      const s = subs.filter((x) => x.active && x.categoryId === categoryId)
      return { categoryId, subscriptions: s, monthlyCost: round2(s.reduce((sum, x) => sum + x.monthlyCost, 0)) }
    })
    .filter((g) => g.subscriptions.length >= 2)
}
