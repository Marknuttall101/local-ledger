import { spendOf } from '../core/analytics'
import type { AiRequestItem, Classifier } from '../core/categorise'
import { mayContainPersonalName, merchantTextForAi, placeOf } from '../core/clean'
import { factsOf } from '../core/facts'
import type { Category, Transaction } from '../core/types'

export interface CategorySuggestion {
  merchantKey: string
  merchant: string
  /** Category the shop is in now */
  currentCategoryId: string
  transactions: number
  spend: number
  /** 0..1 */
  confidence: number
  /** 'ai' = the AI picked the new category; 'name' = the shop's name matches it (AI unavailable) */
  reason: 'ai' | 'name'
}

/**
 * Shops worth asking about, biggest spend first. Never ones that may name a person, and never
 * ones the built-in list already recognises: the privacy promise is that only shops the app
 * doesn't recognise are ever sent.
 */
const MAX_SHOPS = 200

export function candidateShops(transactions: Transaction[], targetId: string): Array<AiRequestItem & { merchant: string; currentCategoryId: string; transactions: number; spend: number }> {
  const shops = new Map<string, { merchant: string; currentCategoryId: string; transactions: number; spend: number; private: boolean; text: string; place?: string }>()
  for (const t of transactions) {
    if (t.amount >= 0 || t.isTransfer || t.categoryId === targetId) continue
    const facts = factsOf(t)
    // Without the original wording we can't rule out a person's name, so those shops aren't sent
    const risky = !t.rawDescription || mayContainPersonalName(t.rawDescription) || facts.transferLike
    const recognised = facts.builtinCategoryId !== undefined || t.categorySource === 'builtin'
    if (recognised) {
      // Kept out for good, even if another row of the same shop looks unrecognised
      shops.set(t.merchantKey, { merchant: t.merchant, currentCategoryId: t.categoryId, transactions: 0, spend: 0, private: true, text: '' })
      continue
    }
    const s = shops.get(t.merchantKey) ?? { merchant: t.merchant, currentCategoryId: t.categoryId, transactions: 0, spend: 0, private: false, text: merchantTextForAi(t.merchant), place: t.rawDescription ? placeOf(t.rawDescription) : undefined }
    s.transactions++
    s.spend += spendOf(t)
    s.private ||= risky
    shops.set(t.merchantKey, s)
  }
  return [...shops.entries()]
    .filter(([, s]) => !s.private && s.text.length >= 2)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, MAX_SHOPS)
    .map(([merchantKey, s]) => ({ merchantKey, text: s.text, place: s.place, merchant: s.merchant, currentCategoryId: s.currentCategoryId, transactions: s.transactions, spend: s.spend }))
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !['such', 'with', 'from', 'that', 'this', 'other', 'your', 'stores', 'shops', 'services'].includes(w))

/**
 * Which of the user's shops look like they belong in a (new) category. Asks the AI the same
 * question as on import, now with the new category on the list; shops whose answer is the new
 * category are suggested. Nothing changes until the user accepts. If the AI isn't reachable,
 * falls back to shops whose names share a word with the category's name.
 */
export async function suggestForCategory(
  target: Category,
  transactions: Transaction[],
  categories: Category[],
  classifier: Classifier,
  onProgress?: (done: number, total: number) => void,
): Promise<CategorySuggestion[]> {
  const shops = candidateShops(transactions, target.id)
  if (!shops.length) return []
  const results = await classifier.classify(
    shops.map(({ merchantKey, text }) => ({ merchantKey, text })),
    categories,
    onProgress,
  )
  const byKey = new Map(results.map((r) => [r.merchantKey, r]))
  // Offline, only the category's own name is a strong enough signal (descriptions are too broad)
  const keywords = new Set(words(target.name))
  const out: CategorySuggestion[] = []
  for (const s of shops) {
    const r = byKey.get(s.merchantKey)
    const base = { merchantKey: s.merchantKey, merchant: s.merchant, currentCategoryId: s.currentCategoryId, transactions: s.transactions, spend: s.spend }
    if (r?.source === 'ai' && r.categoryId === target.id) out.push({ ...base, confidence: r.confidence, reason: 'ai' })
    else if (r?.source !== 'ai' && words(s.merchant).some((w) => keywords.has(w))) out.push({ ...base, confidence: 0.5, reason: 'name' })
  }
  return out.sort((a, b) => b.confidence - a.confidence || b.spend - a.spend)
}
