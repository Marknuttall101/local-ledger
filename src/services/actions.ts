import type { Classifier, ClassifierResult } from '../core/categorise'
import { STARTER_CATEGORIES, STARTER_GROUPS, TRANSFER_CATEGORY, UNCATEGORISED } from '../core/categories'
import { generateSampleStatements, SAMPLE_INSIGHTS } from '../core/sampleData'
import type { Category, CategoryGroup, FraudVerdict, SavedView } from '../core/types'
import { merchantKeyOf } from '../core/clean'
import { matchesKeyword } from '../core/keywords'
import { ALL_TABLES, db, setMeta } from '../db/db'
import { checkBackupTables, DEVICE_ONLY_SETTINGS } from './backup'
import { commitStatement, reassignShops, refreshCategories } from './importer'

/**
 * Change a transaction's category. scope "merchant" also creates a rule so every past and future
 * transaction from that merchant follows. Every change is logged so we can measure accuracy.
 */
export async function changeCategory(transactionId: string, categoryId: string, scope: 'one' | 'merchant') {
  const t = await db.transactions.get(transactionId)
  if (!t) return
  const at = new Date().toISOString()
  await db.corrections.add({
    at,
    transactionId,
    merchantKey: t.merchantKey,
    aiCategoryId: t.categoryId,
    aiSource: t.categorySource,
    aiConfidence: t.confidence,
    userCategoryId: categoryId,
    scope,
  })
  if (scope === 'merchant') {
    await db.rules.put({ merchantKey: t.merchantKey, categoryId, createdAt: at })
    // A merchant-wide choice replaces any one-off overrides for that merchant
    const same = await db.transactions.where('merchantKey').equals(t.merchantKey).toArray()
    await db.transactions.bulkPut(same.map((x) => ({ ...x, manualOverride: false })))
    await refreshCategories()
  } else {
    await db.transactions.put({
      ...t,
      categoryId,
      categorySource: 'user',
      confidence: 1,
      manualOverride: true,
      isTransfer: categoryId === TRANSFER_CATEGORY,
    })
  }
}

/** Accept the suggested category as correct (clears it from "Needs a quick look") */
export async function confirmCategory(transactionId: string) {
  const t = await db.transactions.get(transactionId)
  if (t) await changeCategory(transactionId, t.categoryId, 'merchant')
}

/**
 * "Legit" teaches the app: this merchant stops being flagged. "Not me" keeps it highlighted.
 */
export async function markFraud(transactionId: string, verdict: FraudVerdict) {
  const t = await db.transactions.get(transactionId)
  if (!t) return
  const at = new Date().toISOString()
  await db.fraudDecisions.put({ key: transactionId, verdict, at })
  if (verdict === 'legit') await db.fraudDecisions.put({ key: `merchant:${t.merchantKey}`, verdict, at })
}

export async function undoFraudDecision(transactionId: string) {
  const t = await db.transactions.get(transactionId)
  await db.fraudDecisions.delete(transactionId)
  if (t) await db.fraudDecisions.delete(`merchant:${t.merchantKey}`)
}

// ---- Categories

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'category'

export async function addCategory(groupId: string, name: string, hint = ''): Promise<Category> {
  let id = slug(name)
  while (await db.categories.get(id)) id += '-2'
  const c: Category = { id, groupId, name: name.trim(), hint: hint.trim() || name.trim() }
  await db.categories.add(c)
  return c
}

export async function updateCategory(id: string, changes: Partial<Pick<Category, 'name' | 'hint' | 'groupId'>>) {
  await db.categories.update(id, changes)
}

/** Delete a category: its transactions become Uncategorised and rules pointing at it are removed */
export async function deleteCategory(id: string) {
  if ([UNCATEGORISED, TRANSFER_CATEGORY, 'income'].includes(id)) return
  await db.transaction('rw', [db.categories, db.rules, db.transactions, db.insights], async () => {
    await db.categories.delete(id)
    await db.rules.where('merchantKey').anyOf((await db.rules.toArray()).filter((r) => r.categoryId === id).map((r) => r.merchantKey)).delete()
    await db.insights.bulkDelete((await db.insights.toArray()).filter((i) => i.categoryId === id).map((i) => i.merchantKey))
    const affected = await db.transactions.where('categoryId').equals(id).toArray()
    await db.transactions.bulkPut(affected.map((t) => ({ ...t, categoryId: UNCATEGORISED, manualOverride: false })))
  })
  await refreshCategories()
}

export async function addGroup(name: string, color: string): Promise<CategoryGroup> {
  let id = slug(name)
  while (await db.groups.get(id)) id += '-2'
  const g = { id, name: name.trim(), color }
  await db.groups.add(g)
  return g
}

export async function updateGroup(id: string, changes: Partial<Pick<CategoryGroup, 'name' | 'color'>>) {
  await db.groups.update(id, changes)
}

// ---- Example data

/** A classifier that answers from prepared example answers — the example never touches the network */
const sampleClassifier: Classifier = {
  name: 'ai',
  async classify(items) {
    return items.map((i): ClassifierResult => {
      const s = SAMPLE_INSIGHTS[i.merchantKey]
      return {
        merchantKey: i.merchantKey,
        categoryId: s?.categoryId ?? UNCATEGORISED,
        confidence: s?.confidence ?? 0,
        subscriptionLikelihood: s?.subscription ?? 0,
        suspiciousLikelihood: s?.suspicious ?? 0,
        source: 'ai',
      }
    })
  },
}

export async function loadSampleData(onProgress?: (msg: string) => void) {
  await deleteAllData()
  await setMeta('sample', true)
  for (const s of generateSampleStatements()) {
    onProgress?.(`Reading ${s.accountLabel}…`)
    await commitStatement(s, `example-${s.accountSuffix}.csv`, sampleClassifier)
  }
}

// ---- Backup, restore, delete

const BACKUP_FORMAT = 'local-ledger-backup'

export async function exportBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {}
  for (const name of ALL_TABLES) tables[name] = await db.table(name).toArray()
  const payload = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), tables }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

export async function restoreBackup(file: File) {
  let payload: { format?: string; tables?: Record<string, unknown[]> }
  try {
    payload = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't a Local Ledger backup.")
  }
  if (payload.format !== BACKUP_FORMAT || !payload.tables) throw new Error("That file isn't a Local Ledger backup.")
  // Checked in full before anything is cleared, so a bad file leaves the current data untouched
  const tables = checkBackupTables(payload.tables)
  await db.transaction('rw', ALL_TABLES.map((n) => db.table(n)), async () => {
    // Settings about what may be sent elsewhere stay as chosen on this device
    const keep = (await db.meta.bulkGet([...DEVICE_ONLY_SETTINGS])).filter((r) => r !== undefined)
    for (const name of ALL_TABLES) {
      await db.table(name).clear()
      const rows = tables[name]
      if (rows.length) await db.table(name).bulkAdd(rows)
    }
    if (keep.length) await db.meta.bulkPut(keep)
  })
}

/** Wipe everything stored in this browser and start fresh with the starter categories */
export async function deleteAllData() {
  await db.transaction('rw', ALL_TABLES.map((n) => db.table(n)), async () => {
    for (const name of ALL_TABLES) await db.table(name).clear()
    await db.groups.bulkAdd(STARTER_GROUPS)
    await db.categories.bulkAdd(STARTER_CATEGORIES)
  })
}

// ---- Saved views

/** Save a page's filters under a name; saving again under the same name replaces it */
export async function saveView(page: SavedView['page'], name: string, state: unknown): Promise<SavedView> {
  const clean = name.trim().slice(0, 60)
  const existing = (await db.views.where('page').equals(page).toArray()).find((v) => v.name.toLowerCase() === clean.toLowerCase())
  const view: SavedView = { id: existing?.id ?? crypto.randomUUID(), page, name: clean, state: JSON.stringify(state), at: new Date().toISOString() }
  await db.views.put(view)
  return view
}

export async function deleteView(id: string) {
  await db.views.delete(id)
}

// ---- Accounts

/**
 * Remove one uploaded statement and the transactions it added, keeping categories, rules and
 * corrections. An account left with nothing in it is removed too.
 */
export async function removeImport(importId: string) {
  await db.transaction('rw', [db.imports, db.transactions, db.accounts], async () => {
    const record = await db.imports.get(importId)
    if (!record) return
    await db.transactions.where('importId').equals(importId).delete()
    await db.imports.delete(importId)
    if (!(await db.transactions.where('accountId').equals(record.accountId).count())) {
      await db.imports.where('accountId').equals(record.accountId).delete()
      await db.accounts.delete(record.accountId)
    }
  })
  // Transfers between accounts are matched in pairs, so the other half may need re-checking
  await refreshCategories()
}

/** Uploaded files, newest first. Sorted here because the upload time isn't indexed in the database. */
export async function importsNewestFirst() {
  return (await db.imports.toArray()).sort((a, b) => b.at.localeCompare(a.at))
}

/** Accounts are told apart only by the name the user gives them */
export async function renameAccount(id: string, label: string) {
  const clean = label.trim().slice(0, 60)
  if (clean) await db.accounts.update(id, { label: clean })
}

// ---- Shop names

/**
 * Name every transaction whose bank wording contains `keyword` (e.g. "ZENTROVA") as one shop, now and
 * in future uploads, whatever else the bank wrote around it. Shops merged this way keep the
 * category choices you made for them. Returns how many transactions now carry the name.
 */
export async function renameByKeyword(keyword: string, name: string): Promise<number> {
  const k = keyword.trim().toUpperCase().replace(/\s+/g, ' ')
  const clean = name.trim()
  if (!k || !clean) return 0
  const at = new Date().toISOString()
  await db.nameKeywords.put({ keyword: k, name: clean, at })
  await db.merchantNames.put({ merchantKey: merchantKeyOf(clean), name: clean, at })
  await reassignShops()
  // A shop that was already called this keeps its old transactions too
  await db.transactions.where('merchantKey').equals(merchantKeyOf(clean)).modify({ merchant: clean })
  return (await db.transactions.toArray()).filter((t) => t.rawDescription && matchesKeyword(t.rawDescription, k)).length
}

/**
 * Rename a shop everywhere, now and for future imports. Its category stays exactly as it is: a new
 * name is only a label, and asking the engine again could move the shop somewhere unexpected.
 */
export async function renameMerchant(merchantKey: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) return
  await db.transaction('rw', [db.merchantNames, db.transactions], async () => {
    await db.merchantNames.put({ merchantKey, name: clean, at: new Date().toISOString() })
    const rows = await db.transactions.where('merchantKey').equals(merchantKey).toArray()
    await db.transactions.bulkPut(rows.map((t) => ({ ...t, merchant: clean })))
  })
}
