import type { SavingInsight } from './savings'
import { BILL_CATEGORIES, type Subscription } from './subscriptions'
import type { AuditSnapshot, AuditSubscription, ConfirmedSaving, Transaction } from './types'

const DAY = 86_400_000
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

/** How late a charge can be before it counts as stopped */
const GRACE_DAYS: Record<AuditSubscription['cadence'], number> = { weekly: 4, fortnightly: 5, monthly: 10, quarterly: 20, yearly: 45 }

/** What an audit keeps: each subscription and its price, and the savings ideas shown */
export function snapshotOf(
  id: string,
  at: string,
  transactions: Transaction[],
  subscriptions: Subscription[],
  savings: SavingInsight[],
): AuditSnapshot {
  const accountOf = new Map(transactions.map((t) => [t.id, t.accountId]))
  return {
    id,
    at,
    updatedAt: at,
    dataThrough: transactions.reduce((m, t) => (t.date > m ? t.date : m), ''),
    subscriptions: subscriptions.map((s) => ({
      merchantKey: s.merchantKey,
      merchant: s.merchant,
      categoryId: s.categoryId,
      cadence: s.cadence,
      amount: s.amount,
      yearlyCost: s.yearlyCost,
      lastDate: s.lastDate,
      nextExpected: s.nextExpected,
      accountId: accountOf.get(s.transactionIds.at(-1) ?? '') ?? '',
      active: s.active,
    })),
    savingsFound: savings.map((s) => ({ id: s.id, kind: s.kind, title: s.title, yearlySaving: s.yearlySaving })),
  }
}

/**
 * Savings the newer data proves, compared with an earlier audit:
 * - cheaper: the subscription is still charged, at a lower price
 * - cancelled: no charge since, although that account's statements now go well past when the next
 *   one was due (so a missing statement, or a yearly plan not yet due, never counts)
 * Bills (rent, utilities, insurance…) are left out: their amounts vary and stopping them usually
 * isn't a saving.
 */
export function confirmSavings(baseline: AuditSnapshot, transactions: Transaction[], current: Subscription[], at: string): ConfirmedSaving[] {
  const latestByAccount = new Map<string, string>()
  for (const t of transactions) if (t.date > (latestByAccount.get(t.accountId) ?? '')) latestByAccount.set(t.accountId, t.date)
  const now = new Map(current.map((s) => [s.merchantKey, s]))
  const out: ConfirmedSaving[] = []
  for (const before of baseline.subscriptions) {
    if (!before.active || BILL_CATEGORIES.has(before.categoryId)) continue
    const base = { merchantKey: before.merchantKey, merchant: before.merchant, from: before.amount, baselineAuditId: baseline.id, confirmedAt: at }
    const after = now.get(before.merchantKey)
    if (after?.active && after.lastDate > before.lastDate && after.amount < before.amount - Math.max(0.5, before.amount * 0.03)) {
      out.push({ ...base, key: `cheaper:${before.merchantKey}:${baseline.id}`, kind: 'cheaper', to: after.amount, yearlySaving: round2((before.amount - after.amount) * (before.yearlyCost / before.amount)) })
      continue
    }
    const coveredUntil = latestByAccount.get(before.accountId) ?? ''
    if (coveredUntil < addDays(before.nextExpected, GRACE_DAYS[before.cadence])) continue
    // Any charge of a similar size since means it's still going (perhaps billed differently)
    const chargedSince = transactions.some(
      (t) => t.merchantKey === before.merchantKey && t.amount < 0 && t.date > before.lastDate && -t.amount >= before.amount * 0.5 && -t.amount <= before.amount * 1.5,
    )
    if (!chargedSince) out.push({ ...base, key: `cancelled:${before.merchantKey}:${baseline.id}`, kind: 'cancelled', to: 0, yearlySaving: before.yearlyCost })
  }
  return out
}
