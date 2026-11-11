import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { needsReview, shopsToReview } from '../core/categorise'
import { findFraudFlags } from '../core/fraud'
import { findSavings } from '../core/savings'
import { detectSubscriptions, subscriptionHints } from '../core/subscriptions'
import type { Account, Category, CategoryGroup, FraudDecision, MerchantInsight, Transaction } from '../core/types'
import { db } from '../db/db'

export interface AppData {
  loaded: boolean
  transactions: Transaction[]
  categories: Category[]
  groups: CategoryGroup[]
  accounts: Account[]
  insights: Map<string, MerchantInsight>
  decisions: Map<string, FraudDecision>
  isSample: boolean
  categoryById: Map<string, Category>
  groupById: Map<string, CategoryGroup>
}

/** Everything the screens need, kept live: any change in storage re-renders automatically */
export function useAppData(): AppData {
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const groups = useLiveQuery(() => db.groups.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const insights = useLiveQuery(() => db.insights.toArray(), [])
  const decisions = useLiveQuery(() => db.fraudDecisions.toArray(), [])
  const sample = useLiveQuery(() => db.meta.get('sample'), [])

  return useMemo(() => {
    const cats = categories ?? []
    const grps = groups ?? []
    return {
      loaded: transactions !== undefined && categories !== undefined,
      transactions: transactions ?? [],
      categories: cats,
      groups: grps,
      accounts: accounts ?? [],
      insights: new Map((insights ?? []).map((i) => [i.merchantKey, i])),
      decisions: new Map((decisions ?? []).map((d) => [d.key, d])),
      isSample: Boolean(sample?.value),
      categoryById: new Map(cats.map((c) => [c.id, c])),
      groupById: new Map(grps.map((g) => [g.id, g])),
    }
  }, [transactions, categories, groups, accounts, insights, decisions, sample])
}

/** Subscriptions, savings, fraud flags and the review queue, worked out from the data */
export function useInsights(data: AppData) {
  return useMemo(() => {
    const hints = subscriptionHints(data.insights.values())
    const subscriptions = detectSubscriptions(data.transactions, hints)
    const savings = findSavings(data.transactions, subscriptions, data.categories)
    const flags = findFraudFlags(data.transactions, data.insights, data.decisions)
    const openFlags = flags.filter((f) => !data.decisions.has(f.transactionId))
    const toReview = data.transactions.filter(needsReview)
    return { subscriptions, savings, flags, openFlags, toReview, reviewShops: shopsToReview(data.transactions) }
  }, [data])
}
