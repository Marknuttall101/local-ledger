import { isRefundLike, stripRefundPrefix, trailingCountry } from './clean'
import { findKnownMerchant } from './merchants'
import { looksLikeTransfer } from './transfers'
import type { Transaction } from './types'

export interface WordingFacts {
  transferLike: boolean
  refundLike: boolean
  builtinCategoryId?: string
  country?: string
}

/** What the app needs to know from the bank's original wording, worked out once at import */
export function factsFromWording(rawDescription: string): WordingFacts {
  const facts: WordingFacts = {
    transferLike: looksLikeTransfer(rawDescription),
    refundLike: isRefundLike(rawDescription),
  }
  const builtin = findKnownMerchant(stripRefundPrefix(rawDescription))?.categoryId
  if (builtin) facts.builtinCategoryId = builtin
  const country = trailingCountry(rawDescription)
  if (country) facts.country = country
  return facts
}

/**
 * Facts for a transaction: from the original wording when this browser has it (so improvements
 * to the built-in rules apply), otherwise the facts saved with it (records restored without
 * the original wording).
 */
export function factsOf(t: Pick<Transaction, 'rawDescription' | 'transferLike' | 'refundLike' | 'builtinCategoryId' | 'country'>): WordingFacts {
  if (t.rawDescription) return factsFromWording(t.rawDescription)
  return { transferLike: Boolean(t.transferLike), refundLike: Boolean(t.refundLike), builtinCategoryId: t.builtinCategoryId, country: t.country }
}
