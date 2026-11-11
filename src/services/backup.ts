import { ALL_TABLES } from '../db/db'

/**
 * Checks a backup file's contents before anything is restored. A backup is just a JSON file, so it
 * may have been edited or made by someone else: every row must look like what the app itself
 * writes, or nothing is restored. Settings that decide what may leave the device (smart sorting)
 * are never taken from a backup; the choice made on this device stays.
 */

type Row = Record<string, unknown>
type Check = (row: Row) => boolean

const str = (v: unknown) => typeof v === 'string'
const optStr = (v: unknown) => v === undefined || typeof v === 'string'
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const optBool = (v: unknown) => v === undefined || typeof v === 'boolean'
const isoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const SOURCES = new Set(['rule', 'builtin', 'ai', 'fallback', 'user', 'transfer'])

/** Settings a backup may not bring in: they control what is sent to outside services */
export const DEVICE_ONLY_SETTINGS = new Set(['smartSorting'])

const CHECKS: Record<(typeof ALL_TABLES)[number], Check> = {
  transactions: (r) =>
    str(r.id) && str(r.accountId) && str(r.importId) && isoDate(r.date) && num(r.amount) && optStr(r.rawDescription) &&
    str(r.merchant) && str(r.merchantKey) && str(r.categoryId) && SOURCES.has(r.categorySource as string) && num(r.confidence) &&
    typeof r.isTransfer === 'boolean' && optStr(r.note) && optBool(r.foreign) && optBool(r.manualOverride),
  accounts: (r) => str(r.id) && str(r.bank) && str(r.label) && optStr(r.suffix),
  imports: (r) => str(r.id) && str(r.accountId),
  categories: (r) => str(r.id) && str(r.groupId) && str(r.name) && optStr(r.hint),
  groups: (r) => str(r.id) && str(r.name) && typeof r.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(r.color),
  rules: (r) => str(r.merchantKey) && str(r.categoryId),
  corrections: (r) => (r.id === undefined || num(r.id)) && str(r.merchantKey),
  insights: (r) =>
    str(r.merchantKey) && str(r.categoryId) && num(r.confidence) && num(r.subscriptionLikelihood) && num(r.suspiciousLikelihood) &&
    (r.source === 'ai' || r.source === 'fallback'),
  fraudDecisions: (r) => str(r.key) && (r.verdict === 'legit' || r.verdict === 'not-me'),
  csvMappings: (r) => str(r.signature),
  meta: (r) => str(r.key),
  merchantNames: (r) => str(r.merchantKey) && str(r.name),
  views: (r) => str(r.id) && str(r.page) && str(r.name) && str(r.state),
  nameKeywords: (r) => str(r.keyword) && str(r.name),
  audits: (r) => str(r.id) && str(r.at),
  confirmedSavings: (r) => str(r.key) && str(r.baselineAuditId),
}

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The rows to restore, table by table, or an error naming the first problem found */
export function checkBackupTables(tables: unknown): Record<string, Row[]> {
  if (!isRow(tables)) throw new Error("That file isn't a Local Ledger backup.")
  const out: Record<string, Row[]> = {}
  for (const name of ALL_TABLES) {
    const rows = tables[name] ?? []
    if (!Array.isArray(rows)) throw new Error(`This backup can't be restored: "${name}" isn't a list.`)
    rows.forEach((row, i) => {
      if (!isRow(row) || !CHECKS[name](row)) throw new Error(`This backup can't be restored: entry ${i + 1} in "${name}" isn't in the expected shape.`)
    })
    out[name] = name === 'meta' ? rows.filter((r: Row) => !DEVICE_ONLY_SETTINGS.has(r.key as string)) : rows
  }
  return out
}
