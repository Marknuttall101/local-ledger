import { INCOME_CATEGORY, TRANSFER_CATEGORY, UNCATEGORISED } from './categories'
import { mayContainPersonalName, merchantTextForAi, placeOf } from './clean'
import { factsOf } from './facts'
import type { Category, MerchantInsight, MerchantRule, Transaction } from './types'

/** AI answers at or above this confidence are applied without asking */
export const AUTO_ACCEPT = 0.6

export interface CategoriseContext {
  rules: Map<string, MerchantRule>
  insights: Map<string, MerchantInsight>
  categoryIds: Set<string>
}

/**
 * Decide a transaction's category, cheapest and most private first:
 * transfer rules → the user's own rules → built-in merchant list → cached AI answer.
 * Transactions the user changed individually are left alone.
 */
export function categoriseOne(t: Transaction, ctx: CategoriseContext): Transaction {
  if (t.manualOverride && ctx.categoryIds.has(t.categoryId)) return t
  const valid = (id: string | undefined) => (id && ctx.categoryIds.has(id) ? id : undefined)
  const set = (categoryId: string, categorySource: Transaction['categorySource'], confidence: number, isTransfer = false): Transaction => ({
    ...t,
    categoryId,
    categorySource,
    confidence,
    isTransfer,
    manualOverride: false,
  })

  const rule = valid(ctx.rules.get(t.merchantKey)?.categoryId)
  if (rule) return set(rule, 'rule', 1, rule === TRANSFER_CATEGORY)

  const facts = factsOf(t)
  if (facts.transferLike || t.isTransfer || t.ownTransfer) return set(TRANSFER_CATEGORY, 'transfer', 1, true)

  // Refunds from a shop keep the shop's category (they reduce that spending)
  const builtin = valid(facts.builtinCategoryId)
  if (builtin) return set(builtin, 'builtin', 0.95)

  const insight = ctx.insights.get(t.merchantKey)
  const ai = valid(insight?.categoryId)
  if (t.amount > 0) return ai && facts.refundLike ? set(ai, insight!.source, insight!.confidence) : set(INCOME_CATEGORY, 'rule', 0.9)
  if (insight && ai) return set(ai, insight.source, insight.confidence)

  return set(UNCATEGORISED, 'fallback', 0)
}

export function categoriseAll(transactions: Transaction[], ctx: CategoriseContext): Transaction[] {
  return transactions.map((t) => categoriseOne(t, ctx))
}

export interface AiRequestItem {
  merchantKey: string
  /** The only text that leaves the device, with `place` */
  text: string
  /** Town or state the bank listed, to help the AI tell similar names apart (e.g. "NSW") */
  place?: string
}

/**
 * Merchants that still need the AI: spending rows not covered by a rule, the built-in list or
 * a cached answer. Each merchant appears once. Rows that might contain a person's name
 * (transfers, pay-anyone) are never included.
 */
export function merchantsNeedingAi(transactions: Transaction[], ctx: CategoriseContext): AiRequestItem[] {
  const out = new Map<string, AiRequestItem>()
  for (const t of transactions) {
    if (t.amount >= 0 || t.isTransfer || t.manualOverride) continue
    if (out.has(t.merchantKey) || ctx.insights.has(t.merchantKey) || ctx.rules.has(t.merchantKey)) continue
    // Without the bank's original wording we can't rule out a person's name, so the shop is never sent
    if (!t.rawDescription) continue
    const facts = factsOf(t)
    if (facts.transferLike || facts.builtinCategoryId) continue
    if (mayContainPersonalName(t.rawDescription)) continue
    const text = merchantTextForAi(t.merchant)
    if (text.length < 2) continue
    const place = placeOf(t.rawDescription)
    out.set(t.merchantKey, place ? { merchantKey: t.merchantKey, text, place } : { merchantKey: t.merchantKey, text })
  }
  return [...out.values()]
}

/** Transactions worth a quick look from the user: uncertain or uncategorised spending */
/**
 * A shop name that looks like leftover bank wording rather than a shop: starts with punctuation or
 * a long number, has a time in it ("06:"), ends mid-word ("Ref-"), or has hardly any letters.
 */
export function oddShopName(name: string): boolean {
  const n = name.trim()
  return /^[^A-Za-z0-9]/.test(n) || /^\d{3,}/.test(n) || /\d:/.test(n) || /[-:/]$/.test(n) || (n.match(/[A-Za-z]/g)?.length ?? 0) < 2
}

export function needsReview(t: Transaction): boolean {
  if (t.isTransfer || t.amount >= 0 || t.manualOverride) return false
  if (t.categorySource === 'rule' || t.categorySource === 'user') return false
  // A garbled name usually means the bank wrote it in a way we don't understand yet
  if (oddShopName(t.merchant)) return true
  if (t.categorySource === 'builtin') return false
  return t.categoryId === UNCATEGORISED || t.confidence < AUTO_ACCEPT
}

/** Shops with at least one transaction needing a look — fixing a shop fixes all its transactions */
export function shopsToReview(transactions: Transaction[]): number {
  return new Set(transactions.filter(needsReview).map((t) => t.merchantKey)).size
}

export interface ClassifierResult {
  merchantKey: string
  categoryId: string
  confidence: number
  subscriptionLikelihood: number
  suspiciousLikelihood: number
  /** Which engine produced this answer; defaults to the classifier's own name */
  source?: 'ai' | 'fallback'
}

/** Something that can answer "which category is this merchant?" — Jev, or the offline stand-in */
export interface Classifier {
  readonly name: 'ai' | 'fallback'
  classify(items: AiRequestItem[], categories: Category[], onProgress?: (done: number, total: number) => void): Promise<ClassifierResult[]>
}
