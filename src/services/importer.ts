import Papa from 'papaparse'
import { categoriseAll, merchantsNeedingAi, type AiRequestItem, type CategoriseContext, type Classifier } from '../core/categorise'
import { PREVIOUS_GROUP_COLORS, PREVIOUS_GROUPS, PREVIOUS_HINTS, STARTER_CATEGORIES, STARTER_GROUPS, STARTER_VERSION } from '../core/categories'
import { cleanMerchant, CLEAN_VERSION, merchantKeyOf } from '../core/clean'
import { removeDuplicates } from '../core/dedupe'
import { factsFromWording } from '../core/facts'
import { csvSignature, presetMapping, readCsvWithMapping } from '../core/readers/csv'
import { decide, infoFromTable, signatureFor } from '../core/readers/generic'
import { pickReader } from '../core/readers/index'
import { extractPdfItems, ScannedPdfError } from '../core/readers/pdfExtract'
import { pdfToTable } from '../core/readers/pdfTable'
import type { ReaderInput } from '../core/readers/types'
import { keywordFor } from '../core/keywords'
import { findMatchedTransfers } from '../core/transfers'
import type { Account, CsvMapping, MerchantInsight, NameKeyword, ParsedStatement, StatementInfo, Transaction } from '../core/types'
import { db, getMeta, setMeta } from '../db/db'

export type FileAnalysis =
  | { status: 'recognised'; fileName: string; statement: ParsedStatement; rows?: string[][]; mapping?: CsvMapping; info?: StatementInfo }
  | { status: 'needs-mapping'; fileName: string; rows: string[][]; mapping: CsvMapping; info?: StatementInfo }
  | { status: 'error'; fileName: string; message: string }

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export function parseCsvText(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  return parsed.data.map((r) => r.map((c) => (c ?? '').toString()))
}

/** Read a dropped file entirely inside the browser and work out which bank layout it is */
export async function analyseFile(file: File): Promise<FileAnalysis> {
  const fileName = file.name
  const isPdf = /\.pdf$/i.test(fileName) || file.type === 'application/pdf'
  const isCsv = /\.(csv|txt)$/i.test(fileName) || /csv|text\/plain/.test(file.type)
  try {
    if (isPdf) {
      const pdfjs = await loadPdfJs()
      const { items, text } = await extractPdfItems(pdfjs as never, new Uint8Array(await file.arrayBuffer()))
      const input: ReaderInput = { kind: 'pdf', fileName, items, text }
      const reader = pickReader(input)
      if (reader) return { status: 'recognised', fileName, statement: reader.read(input) }
      const table = pdfToTable(items)
      if (!table) {
        return {
          status: 'error',
          fileName,
          message: "We couldn't find a list of transactions in this PDF. If it's a bank statement, try downloading it as a CSV file instead — we'll walk you through it.",
        }
      }
      const info = infoFromTable(table, fileName)
      return fromDecision(fileName, table.rows, info, await db.csvMappings.get(signatureFor(table.rows, info)))
    }
    if (isCsv) {
      const rows = parseCsvText(await file.text())
      if (!rows.length) return { status: 'error', fileName, message: 'This file is empty.' }
      const saved = await db.csvMappings.get(csvSignature(rows))
      if (saved) return { status: 'recognised', fileName, statement: readCsvWithMapping(rows, saved, 'csv-saved'), rows, mapping: saved }
      const reader = pickReader({ kind: 'csv', fileName, rows })
      if (reader) return { status: 'recognised', fileName, statement: reader.read({ kind: 'csv', fileName, rows }), rows, mapping: presetMapping(reader.id, rows) }
      return fromDecision(fileName, rows, { kind: 'csv', fileName }, undefined)
    }
    return { status: 'error', fileName, message: 'Please drop a PDF or CSV statement downloaded from your bank.' }
  } catch (e) {
    if (e instanceof ScannedPdfError) {
      return { status: 'error', fileName, message: 'This PDF is a scanned image, so there is no text to read. Try downloading a CSV or a text-based PDF from your bank.' }
    }
    console.error(e)
    return { status: 'error', fileName, message: "Sorry — we couldn't read this file. Is it a statement downloaded from your bank?" }
  }
}

function fromDecision(fileName: string, rows: string[][], info: StatementInfo, saved: CsvMapping | undefined): FileAnalysis {
  const d = decide(rows, info, saved)
  return d.status === 'recognised'
    ? { status: 'recognised', fileName, statement: d.statement, rows, mapping: d.mapping, info }
    : { status: 'needs-mapping', fileName, rows, mapping: d.mapping, info }
}

export interface ImportProgress {
  phase: 'saving' | 'categorising' | 'done'
  done?: number
  total?: number
}

export interface ImportSummary {
  accountId: string
  added: number
  duplicates: number
  askedAi: number
}

/**
 * Which of the user's existing accounts a statement most likely belongs to: same bank and same
 * last digits, or else same bank and same account name.
 */
export function suggestAccount(s: ParsedStatement, accounts: Account[]): string | undefined {
  const sameBank = accounts.filter((a) => a.bank.toLowerCase() === s.bank.toLowerCase())
  // Card/account digits decide when both sides have them: two accounts both called "Everyday" are different accounts
  if (s.accountSuffix) {
    const bySuffix = sameBank.find((a) => a.suffix === s.accountSuffix)
    if (bySuffix) return bySuffix.id
  }
  return sameBank.find((a) => a.label.toLowerCase() === s.accountLabel.toLowerCase() && !(a.suffix && s.accountSuffix))?.id
}

export async function categoriseContext(): Promise<CategoriseContext> {
  const [rules, insights, categories] = await Promise.all([db.rules.toArray(), db.insights.toArray(), db.categories.toArray()])
  return {
    rules: new Map(rules.map((r) => [r.merchantKey, r])),
    insights: new Map(insights.map((i) => [i.merchantKey, i])),
    categoryIds: new Set(categories.map((c) => c.id)),
  }
}

/** Re-run categorisation for everything (after new AI answers, rule changes, or category edits) */
export async function refreshCategories() {
  const all = await db.transactions.toArray()
  const ctx = await categoriseContext()
  // Matched transfers are worked out fresh each time, so they aren't carried over here — except
  // for records without the bank's wording (e.g. from an older backup), which can't be re-matched
  let next = categoriseAll(
    all.map((t) => (t.manualOverride || !t.rawDescription ? t : { ...t, isTransfer: false })),
    ctx,
  )
  const transferIds = findMatchedTransfers(next)
  if (transferIds.size) {
    next = next.map((t) => (transferIds.has(t.id) && !t.manualOverride ? { ...t, isTransfer: true, categoryId: 'transfers', categorySource: 'transfer', confidence: 1 } : t))
  }
  const changed = next.filter((t, i) => JSON.stringify(t) !== JSON.stringify(all[i]))
  if (changed.length) await db.transactions.bulkPut(changed)
}

/** How a shop is named from the bank's wording: the user's key-word rename if one matches, otherwise the tidied name */
export function shopFor(raw: string, keywords: NameKeyword[]): { name: string; key: string } {
  const kw = keywordFor(raw, keywords)
  return kw ? { name: kw.name, key: merchantKeyOf(kw.name) } : cleanMerchant(raw)
}

/**
 * Work out every stored transaction's shop again (after the cleaning rules improve, or a key-word
 * rename), carrying the user's choices for an old shop across to the new one. Only possible where
 * the bank's original wording is stored (records restored without it keep their shop).
 */
export async function reassignShops(): Promise<number> {
  const [all, rules, names, insights, decisions, keywords] = await Promise.all([
    db.transactions.toArray(),
    db.rules.toArray(),
    db.merchantNames.toArray(),
    db.insights.toArray(),
    db.fraudDecisions.toArray(),
    db.nameKeywords.toArray(),
  ])
  const ruleOf = new Map(rules.map((r) => [r.merchantKey, r]))
  const nameOf = new Map(names.map((n) => [n.merchantKey, n]))
  const insightOf = new Map(insights.map((i) => [i.merchantKey, i]))
  const decisionOf = new Map(decisions.map((d) => [d.key, d]))
  const moves = new Map<string, string>()
  const changed: Transaction[] = []
  for (const t of all) {
    if (!t.rawDescription) continue
    const { name, key } = shopFor(t.rawDescription, keywords)
    if (key === t.merchantKey) continue
    moves.set(t.merchantKey, key)
    const alias = nameOf.get(key) ?? nameOf.get(t.merchantKey)
    changed.push({ ...t, merchantKey: key, merchant: alias?.name ?? name })
  }
  await db.transaction('rw', [db.transactions, db.rules, db.merchantNames, db.insights, db.fraudDecisions], async () => {
    // The user's choices for the old shop carry over, unless the new shop already has its own
    for (const [from, to] of moves) {
      const rule = ruleOf.get(from)
      if (rule && !ruleOf.has(to)) {
        ruleOf.set(to, rule)
        await db.rules.put({ ...rule, merchantKey: to })
      }
      const alias = nameOf.get(from)
      if (alias && !nameOf.has(to)) {
        nameOf.set(to, alias)
        await db.merchantNames.put({ ...alias, merchantKey: to })
      }
      const insight = insightOf.get(from)
      if (insight && !insightOf.has(to)) {
        insightOf.set(to, insight)
        await db.insights.put({ ...insight, merchantKey: to })
      }
      const legit = decisionOf.get(`merchant:${from}`)
      if (legit && !decisionOf.has(`merchant:${to}`)) await db.fraudDecisions.put({ ...legit, key: `merchant:${to}` })
    }
    if (changed.length) await db.transactions.bulkPut(changed)
  })
  if (changed.length) await refreshCategories()
  return changed.length
}

/** When the shop-name cleaning rules improve (e.g. "V7302 Dropbox Dropbox" → "Dropbox"), re-clean stored transactions once */
export async function recleanMerchants(): Promise<number> {
  if (((await getMeta<number>('cleanVersion')) ?? 1) >= CLEAN_VERSION) return 0
  const changed = await reassignShops()
  await setMeta('cleanVersion', CLEAN_VERSION)
  return changed
}

/**
 * Once per improvement to the starter categories: add new ones (e.g. Professional Services) and
 * update descriptions the user hasn't edited, since the AI chooses using them.
 */
export async function updateStarterCategories(): Promise<void> {
  const from = (await getMeta<number>('starterVersion')) ?? 1
  if (from >= STARTER_VERSION) return
  await db.transaction('rw', [db.categories, db.groups, db.meta], async () => {
    const groups = new Set((await db.groups.toArray()).map((g) => g.id))
    // New starter groups (e.g. Business) are added once; one the user deleted later stays deleted
    for (const g of STARTER_GROUPS) {
      if (!groups.has(g.id) && g.id === 'business' && from < 3) {
        await db.groups.add(g)
        groups.add(g.id)
      }
      // A clearer colour for a starter group, unless the user chose their own
      const mine = await db.groups.get(g.id)
      if (mine && PREVIOUS_GROUP_COLORS[g.id]?.includes(mine.color)) await db.groups.update(g.id, { color: g.color })
    }
    for (const starter of STARTER_CATEGORIES) {
      const mine = await db.categories.get(starter.id)
      if (!mine) {
        if (groups.has(starter.groupId)) await db.categories.add(starter)
        continue
      }
      if (PREVIOUS_HINTS[starter.id]?.includes(mine.hint)) await db.categories.update(starter.id, { hint: starter.hint })
      // Follow the starter set into its new group, unless the user moved it somewhere themselves
      if (PREVIOUS_GROUPS[starter.id] === mine.groupId && groups.has(starter.groupId)) await db.categories.update(starter.id, { groupId: starter.groupId })
    }
    await db.meta.put({ key: 'starterVersion', value: STARTER_VERSION })
  })
}

/** Ask the AI (or the offline stand-in) about merchants we haven't seen before */
export async function classifyNewMerchants(classifier: Classifier, onProgress?: (done: number, total: number) => void): Promise<number> {
  const all = await db.transactions.toArray()
  const ctx = await categoriseContext()
  const needed = merchantsNeedingAi(categoriseAll(all, ctx), ctx)
  if (!needed.length) return 0
  const categories = await db.categories.toArray()
  const results = await classifier.classify(needed, categories, onProgress)
  const at = new Date().toISOString()
  const insights: MerchantInsight[] = results.map((r) => ({
    merchantKey: r.merchantKey,
    categoryId: r.categoryId,
    confidence: r.confidence,
    subscriptionLikelihood: r.subscriptionLikelihood,
    suspiciousLikelihood: r.suspiciousLikelihood,
    source: r.source ?? classifier.name,
    at,
  }))
  await db.insights.bulkPut(insights)
  return needed.length
}

/** AI answers below this are offered for a second look ("Sort unsure shops with AI") */
export const RECHECK_BELOW = 0.8

/** After each upload, unsure answers at least this old are asked again */
export const AUTO_RECHECK_AFTER_DAYS = 7

/**
 * Shops whose category came from an unsure engine answer or the offline guess, and the user hasn't
 * set. `olderThanDays` leaves out answers given recently (so automatic re-checks don't repeat daily).
 */
export async function unsureShops(olderThanDays = 0): Promise<AiRequestItem[]> {
  const ctx = await categoriseContext()
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
  const unsure = new Set(
    [...ctx.insights.values()].filter((i) => (i.source === 'fallback' || i.confidence < RECHECK_BELOW) && (!olderThanDays || !i.at || i.at < cutoff)).map((i) => i.merchantKey),
  )
  // Same privacy rules as for a brand-new shop, as if those answers didn't exist
  const fresh: CategoriseContext = { ...ctx, insights: new Map([...ctx.insights].filter(([k]) => !unsure.has(k))) }
  return merchantsNeedingAi(categoriseAll(await db.transactions.toArray(), fresh), fresh).filter((i) => unsure.has(i.merchantKey))
}

/**
 * Ask the AI about shops it, or the on-device guesser, was unsure of.
 * Only real AI answers replace the old ones, so being offline never makes things worse.
 */
export async function recheckUnsureShops(classifier: Classifier, onProgress?: (done: number, total: number) => void, olderThanDays = 0): Promise<{ checked: number; changed: number }> {
  const items = await unsureShops(olderThanDays)
  if (!items.length) return { checked: 0, changed: 0 }
  const before = new Map((await db.insights.bulkGet(items.map((i) => i.merchantKey))).filter(Boolean).map((i) => [i!.merchantKey, i!.categoryId]))
  const results = (await classifier.classify(items, await db.categories.toArray(), onProgress)).filter((r) => r.source === 'ai')
  const at = new Date().toISOString()
  await db.insights.bulkPut(
    results.map((r) => ({
      merchantKey: r.merchantKey,
      categoryId: r.categoryId,
      confidence: r.confidence,
      subscriptionLikelihood: r.subscriptionLikelihood,
      suspiciousLikelihood: r.suspiciousLikelihood,
      source: 'ai' as const,
      at,
    })),
  )
  await refreshCategories()
  return { checked: results.length, changed: results.filter((r) => before.get(r.merchantKey) !== r.categoryId).length }
}

/** Save a confirmed statement, skipping rows already stored, then categorise */
export async function commitStatement(
  statement: ParsedStatement,
  fileName: string,
  classifier: Classifier,
  /** accountId: add to this account. label: make a new account with this name (blank = the bank's name for it). Neither: the best match, or a new account. */
  opts: { mapping?: CsvMapping; accountId?: string; label?: string; onProgress?: (p: ImportProgress) => void } = {},
): Promise<ImportSummary> {
  opts.onProgress?.({ phase: 'saving' })
  const chosenId = opts.accountId ?? (opts.label === undefined ? suggestAccount(statement, await db.accounts.toArray()) : undefined)
  const existingAccount = chosenId ? await db.accounts.get(chosenId) : undefined
  // A new account is known by the name the user gives it, and a random id (never the account number)
  const accountId = existingAccount?.id ?? crypto.randomUUID()
  const account: Account = existingAccount ?? {
    id: accountId,
    bank: statement.bank,
    label: opts.label?.trim() || statement.accountLabel,
    suffix: statement.accountSuffix,
  }
  const names = new Map((await db.merchantNames.toArray()).map((n) => [n.merchantKey, n.name]))
  const keywords = await db.nameKeywords.toArray()
  const importId = crypto.randomUUID()

  const existing = await db.transactions.where('accountId').equals(accountId).toArray()
  const { fresh, duplicates } = removeDuplicates(statement.transactions, existing, (raw) => shopFor(raw, keywords).key)
  const rows: Transaction[] = fresh.map((t) => {
    const { name, key } = shopFor(t.rawDescription, keywords)
    return {
      ...t,
      id: crypto.randomUUID(),
      accountId,
      importId,
      ...factsFromWording(t.rawDescription),
      merchant: names.get(key) ?? name,
      merchantKey: key,
      categoryId: 'uncategorised',
      categorySource: 'fallback',
      confidence: 0,
      isTransfer: false,
    }
  })

  await db.transaction('rw', [db.accounts, db.imports, db.transactions, db.csvMappings], async () => {
    await db.accounts.put(account)
    await db.imports.put({ id: importId, fileName, readerId: statement.readerId, accountId, at: new Date().toISOString(), added: rows.length, skippedDuplicates: duplicates })
    await db.transactions.bulkAdd(rows)
    if (opts.mapping) await db.csvMappings.put({ ...opts.mapping, bank: statement.bank, accountLabel: statement.accountLabel })
  })

  await refreshCategories()
  opts.onProgress?.({ phase: 'categorising', done: 0 })
  const askedAi = await classifyNewMerchants(classifier, (done, total) => opts.onProgress?.({ phase: 'categorising', done, total }))
  // Shops the engine was unsure of a while ago get another try (it may know more now)
  await recheckUnsureShops(classifier, undefined, AUTO_RECHECK_AFTER_DAYS)
  await refreshCategories()
  opts.onProgress?.({ phase: 'done' })
  return { accountId, added: rows.length, duplicates, askedAi }
}
