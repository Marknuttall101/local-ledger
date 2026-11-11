import { confirmSavings, snapshotOf } from '../core/audit'
import { findSavings } from '../core/savings'
import { detectSubscriptions, subscriptionHints } from '../core/subscriptions'
import type { AuditSnapshot } from '../core/types'
import { db, getMeta } from '../db/db'

/** Uploads within this many days of an audit starting belong to that audit */
export const SAME_AUDIT_DAYS = 30

/**
 * Record this audit: the subscriptions and prices seen, and the savings ideas shown ("found").
 * Compared with the previous audit, savings the data now proves are recorded as confirmed.
 * Uploads within a few weeks, or with no newer transactions, update the current audit rather than
 * starting a new one. Example data is never recorded.
 */
export async function recordAudit(now = new Date()): Promise<AuditSnapshot | undefined> {
  if (await getMeta<boolean>('sample')) return undefined
  const [transactions, insights, categories, audits] = await Promise.all([
    db.transactions.toArray(),
    db.insights.toArray(),
    db.categories.toArray(),
    db.audits.orderBy('at').toArray(),
  ])
  if (!transactions.length) return undefined
  const subscriptions = detectSubscriptions(transactions, subscriptionHints(insights))
  const savings = findSavings(transactions, subscriptions, categories)

  const at = now.toISOString()
  const latest = audits.at(-1)
  const fresh = snapshotOf(crypto.randomUUID(), at, transactions, subscriptions, savings)
  const sameAudit = latest && (now.getTime() - Date.parse(latest.at) < SAME_AUDIT_DAYS * 86_400_000 || fresh.dataThrough <= latest.dataThrough)
  const snapshot: AuditSnapshot = sameAudit ? { ...fresh, id: latest.id, at: latest.at } : fresh
  const baseline = sameAudit ? audits.at(-2) : latest

  await db.transaction('rw', [db.audits, db.confirmedSavings], async () => {
    await db.audits.put(snapshot)
    if (!baseline) return
    // Worked out afresh each time, so a statement added later can also undo a confirmation
    const earlier = db.confirmedSavings.where('baselineAuditId').equals(baseline.id)
    const firstConfirmed = new Map((await earlier.toArray()).map((c) => [c.key, c.confirmedAt]))
    await earlier.delete()
    await db.confirmedSavings.bulkPut(confirmSavings(baseline, transactions, subscriptions, at).map((c) => ({ ...c, confirmedAt: firstConfirmed.get(c.key) ?? c.confirmedAt })))
  })
  return snapshot
}
