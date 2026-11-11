import { fullMonths, monthOf, round2, spendOf } from './analytics'
import { currentPriceRise, overlappingSubscriptions, type Subscription } from './subscriptions'
import type { Category, Transaction } from './types'

export type SavingKind =
  | 'foreign-fees'
  | 'cash-advance'
  | 'interest'
  | 'account-fees'
  | 'overlapping-subscriptions'
  | 'price-rise'
  | 'spending-creep'
  | 'takeaway'

export interface SavingInsight {
  id: string
  kind: SavingKind
  title: string
  detail: string
  /** Estimated saving per year, in dollars */
  yearlySaving: number
  transactionIds: string[]
  /**
   * Reserved for later: the kind of product that could help (e.g. "no-foreign-fee card").
   * Product recommendations will attach here.
   */
  productSlot?: string
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`
const money2 = (n: number) => `$${n.toFixed(2)}`

/** What to suggest when someone pays for several services that do the same job */
const OVERLAP_ADVICE: Record<string, string> = {
  streaming: "Keeping just one and rotating when there's something to watch",
  music: 'Keeping just one music service',
  fitness: 'Keeping just the gym or class pass you use most',
  games: 'Keeping just the game subscription you play most',
}

/** Scale a total over `months` months up to a year */
const perYear = (total: number, months: number) => (months > 0 ? (total / months) * 12 : total)

export function findSavings(transactions: Transaction[], subscriptions: Subscription[], categories: Category[]): SavingInsight[] {
  const out: SavingInsight[] = []
  const months = Math.max(1, fullMonths(transactions).length)
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  const feeCheck = (kind: SavingKind, match: (t: Transaction) => boolean, make: (total: number, n: number) => Omit<SavingInsight, 'id' | 'kind' | 'transactionIds' | 'yearlySaving'>) => {
    const rows = transactions.filter((t) => t.amount < 0 && match(t))
    const total = rows.reduce((s, t) => s - t.amount, 0)
    if (total < 1) return
    out.push({ id: kind, kind, yearlySaving: round2(perYear(total, months)), transactionIds: rows.map((t) => t.id), ...make(total, rows.length) })
  }

  feeCheck('foreign-fees', (t) => /^FOREIGN|INTERNATIONAL TRANSACTION FEE|O\/SEAS/i.test(t.rawDescription) && t.categoryId === 'bank-fees', (total, n) => ({
    title: `You paid ${money2(total)} in foreign transaction fees`,
    detail: `${n} fees on overseas purchases. A card with no foreign transaction fees would avoid these completely.`,
    productSlot: 'no-foreign-fee-card',
  }))
  feeCheck('cash-advance', (t) => /CASH ADVANCE (FEE|INTEREST)|INTEREST CHARGES - CAS/i.test(t.rawDescription), (total, n) => ({
    title: `Cash advances cost you ${money2(total)} in fees and interest`,
    detail: `${n} charges from taking cash out on a credit card. Using a debit card for cash avoids these fees and the higher interest rate.`,
    productSlot: 'debit-card',
  }))
  feeCheck('interest', (t) => t.categoryId === 'interest' && !/CAS/i.test(t.rawDescription), (total) => ({
    title: `You paid ${money2(total)} in interest`,
    detail: 'Paying the full closing balance each month, or moving the balance to a 0% balance-transfer card, would avoid this.',
    productSlot: 'balance-transfer-card',
  }))
  feeCheck('account-fees', (t) => t.categoryId === 'bank-fees' && /CARD FEE|ANNUAL FEE|REWARDS FEE|ACCOUNT FEE|MONTHLY FEE|ACCOUNT KEEPING/i.test(t.rawDescription), (total) => ({
    title: `${money2(total)} in card and account fees`,
    detail: 'Check the rewards you earn are worth more than this. Many cards and accounts have no annual fee.',
    productSlot: 'no-fee-card',
  }))

  for (const g of overlappingSubscriptions(subscriptions)) {
    const priciest = Math.max(...g.subscriptions.map((s) => s.monthlyCost))
    const saving = (g.monthlyCost - priciest) * 12
    const names = g.subscriptions.map((s) => s.merchant)
    out.push({
      id: `overlap-${g.categoryId}`,
      kind: 'overlapping-subscriptions',
      title: `${g.subscriptions.length} ${catName.get(g.categoryId) ?? 'similar'} subscriptions: ${money2(g.monthlyCost)}/month`,
      detail: `You're paying for ${names.slice(0, -1).join(', ')} and ${names.at(-1)}. ${OVERLAP_ADVICE[g.categoryId] ?? 'Keeping just the one you use most'} would save about ${money(saving)} a year.`,
      yearlySaving: round2(saving),
      transactionIds: g.subscriptions.flatMap((s) => s.transactionIds),
      productSlot: 'subscription-bundle',
    })
  }

  for (const s of subscriptions) {
    if (!s.active) continue
    const rise = currentPriceRise(s)
    if (!rise) continue
    const extraPerYear = (rise.to - rise.from) * (s.yearlyCost / s.amount)
    if (extraPerYear < 5) continue
    out.push({
      id: `price-${s.merchantKey}`,
      kind: 'price-rise',
      title: `${s.merchant} went up from ${money2(rise.from)} to ${money2(rise.to)}`,
      detail: `Since ${rise.date}, that's an extra ${money(extraPerYear)} a year. It's worth asking for a better deal or comparing plans.`,
      yearlySaving: round2(extraPerYear),
      transactionIds: s.transactionIds,
      productSlot: `switch-${s.categoryId}`,
    })
  }

  // Spending creep: last 3 full months vs the months before
  const full = fullMonths(transactions)
  if (full.length >= 6) {
    const recent = new Set(full.slice(-3))
    const earlier = new Set(full.slice(0, -3))
    const byCat = new Map<string, { recent: number; earlier: number; ids: string[] }>()
    for (const t of transactions) {
      const m = monthOf(t.date)
      const s = spendOf(t)
      if (!s || !['groceries', 'dining', 'cafes', 'takeaway', 'alcohol', 'online-shopping', 'rideshare', 'clothing', 'general-retail', 'games'].includes(t.categoryId)) continue
      const row = byCat.get(t.categoryId) ?? { recent: 0, earlier: 0, ids: [] }
      if (recent.has(m)) {
        row.recent += s
        row.ids.push(t.id)
      } else if (earlier.has(m)) row.earlier += s
      byCat.set(t.categoryId, row)
    }
    for (const [cat, v] of byCat) {
      const recentAvg = v.recent / 3
      const earlierAvg = v.earlier / earlier.size
      if (earlierAvg > 0 && recentAvg > earlierAvg * 1.25 && recentAvg - earlierAvg >= 50) {
        const pct = Math.round((recentAvg / earlierAvg - 1) * 100)
        out.push({
          id: `creep-${cat}`,
          kind: 'spending-creep',
          title: `${catName.get(cat) ?? cat} is up ${pct}% lately`,
          detail: `You've averaged ${money(recentAvg)} a month over the last 3 months, compared with ${money(earlierAvg)} before. Getting back to your usual would save about ${money((recentAvg - earlierAvg) * 12)} a year.`,
          yearlySaving: round2((recentAvg - earlierAvg) * 12),
          transactionIds: v.ids,
        })
      }
    }
  }

  // Takeaway habit
  const takeaway = transactions.filter((t) => t.categoryId === 'takeaway' && spendOf(t) > 0)
  const takeawayYear = perYear(takeaway.reduce((s, t) => s + spendOf(t), 0), months)
  if (takeawayYear / 12 >= 150 && !out.some((s) => s.id === 'creep-takeaway')) {
    const deliveries = takeaway.filter((t) => /UBER ?\*? ?EATS|MENULOG|DOORDASH/i.test(t.rawDescription)).length
    out.push({
      id: 'takeaway',
      kind: 'takeaway',
      title: `Takeaway and delivery: about ${money(takeawayYear / 12)} a month`,
      detail: `${deliveries ? `${deliveries} delivery orders. ` : ''}Swapping a third of these for home cooking would save roughly ${money((takeawayYear / 3) * 0.6)} a year (after the extra groceries).`,
      yearlySaving: round2((takeawayYear / 3) * 0.6),
      transactionIds: takeaway.map((t) => t.id),
      productSlot: 'meal-kit',
    })
  }

  return out.sort((a, b) => b.yearlySaving - a.yearlySaving)
}
