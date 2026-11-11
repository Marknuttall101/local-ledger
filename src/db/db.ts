import Dexie, { type Table } from 'dexie'
import { STARTER_CATEGORIES, STARTER_GROUPS } from '../core/categories'
import type {
  Account,
  AuditSnapshot,
  ConfirmedSaving,
  Category,
  CategoryGroup,
  CorrectionLog,
  CsvMapping,
  FraudDecision,
  ImportRecord,
  MerchantInsight,
  MerchantName,
  MerchantRule,
  NameKeyword,
  SavedView,
  Transaction,
} from '../core/types'

/**
 * Everything the app knows lives here, in this browser's IndexedDB. There is no server copy.
 */
export class LedgerDb extends Dexie {
  transactions!: Table<Transaction, string>
  accounts!: Table<Account, string>
  imports!: Table<ImportRecord, string>
  categories!: Table<Category, string>
  groups!: Table<CategoryGroup, string>
  rules!: Table<MerchantRule, string>
  corrections!: Table<CorrectionLog, number>
  insights!: Table<MerchantInsight, string>
  fraudDecisions!: Table<FraudDecision, string>
  csvMappings!: Table<CsvMapping, string>
  meta!: Table<{ key: string; value: unknown }, string>
  /** Shop names the user has chosen, e.g. "Sq *Bramblecup Cof" → "Bramblecup Coffee" */
  merchantNames!: Table<MerchantName, string>
  views!: Table<SavedView, string>
  /** "Wording containing ZENTROVA is the shop Zentrova" */
  nameKeywords!: Table<NameKeyword, string>
  /** One per audit (quarterly round of uploads): subscriptions, prices and savings ideas */
  audits!: Table<AuditSnapshot, string>
  /** Savings a later audit showed really happened */
  confirmedSavings!: Table<ConfirmedSaving, string>

  constructor(name = 'local-ledger') {
    super(name)
    this.version(1).stores({
      transactions: 'id, accountId, importId, date, merchantKey, categoryId',
      accounts: 'id',
      imports: 'id, accountId',
      categories: 'id, groupId',
      groups: 'id',
      rules: 'merchantKey',
      corrections: '++id, merchantKey, at',
      insights: 'merchantKey',
      fraudDecisions: 'key',
      csvMappings: 'signature',
      meta: 'key',
      merchantNames: 'merchantKey',
      views: 'id, page',
      nameKeywords: 'keyword',
      audits: 'id, at',
      confirmedSavings: 'key, baselineAuditId',
    })
    this.on('populate', (tx) => {
      tx.table('groups').bulkAdd(STARTER_GROUPS)
      tx.table('categories').bulkAdd(STARTER_CATEGORIES)
    })
  }
}

export let db = new LedgerDb()

/** For tests: use a fresh, separately named database */
export function useDatabase(name: string) {
  db = new LedgerDb(name)
  return db
}

export const ALL_TABLES = [
  'transactions',
  'accounts',
  'imports',
  'categories',
  'groups',
  'rules',
  'corrections',
  'insights',
  'fraudDecisions',
  'csvMappings',
  'meta',
  'merchantNames',
  'views',
  'nameKeywords',
  'audits',
  'confirmedSavings',
] as const

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
