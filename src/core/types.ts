/** A transaction as produced by a file reader, before it is stored. */
export interface ParsedTransaction {
  /** ISO date, YYYY-MM-DD */
  date: string
  /** Original description exactly as the bank wrote it (multi-line joined with a space) */
  rawDescription: string
  /** Negative = money out, positive = money in. In dollars. */
  amount: number
  /** Extra detail the bank supplied, e.g. "FRGN AMT: 20.00 U. S. DOLLAR" */
  note?: string
  /** True when the bank shows a foreign currency amount for this row */
  foreign?: boolean
  /** Money moved to or from an account in the account holder's own name */
  ownTransfer?: boolean
}

export interface ParsedStatement {
  readerId: string
  bank: string
  accountLabel: string
  /** Last few digits only, never the full number */
  accountSuffix?: string
  transactions: ParsedTransaction[]
  warnings: string[]
  /** How the amounts were double-checked (general reader only) */
  check?: CheckResult
}

/** What we know about a statement besides its rows */
export interface StatementInfo {
  kind: 'pdf' | 'csv'
  fileName: string
  bank?: string
  accountSuffix?: string
  opening?: number
  closing?: number
}

/** Whether the amounts read from a statement were confirmed by the bank's own balances */
export interface CheckResult {
  status: 'balanced' | 'unchecked' | 'mismatch'
  method?: 'running-balance' | 'totals'
  /** Steps that added up, out of how many were checked */
  matched: number
  checked: number
}

export type CategorySource = 'rule' | 'builtin' | 'ai' | 'fallback' | 'user' | 'transfer'

export interface Transaction extends ParsedTransaction {
  id: string
  accountId: string
  importId: string
  /** Cleaned, human-friendly merchant name, e.g. "Coles" */
  merchant: string
  /** Stable key used for rules and caching, e.g. "coles" */
  merchantKey: string
  categoryId: string
  categorySource: CategorySource
  /** 0..1, how sure we are of the category */
  confidence: number
  /** Card repayments and transfers between own accounts — not spending */
  isTransfer: boolean
  /** True when the category was set by the user on this transaction only */
  manualOverride?: boolean
  // Facts worked out from the original wording at import, kept so a record without the wording
  // still categorises the same way
  transferLike?: boolean
  refundLike?: boolean
  builtinCategoryId?: string
  country?: string
}

export interface Account {
  id: string
  bank: string
  label: string
  suffix?: string
}

export interface CategoryGroup {
  id: string
  name: string
  color: string
}

export interface Category {
  id: string
  groupId: string
  name: string
  /** Short description to help the AI choose */
  hint: string
}

/** A remembered "all from this merchant" decision */
export interface MerchantRule {
  merchantKey: string
  categoryId: string
  createdAt: string
}

export interface MerchantName {
  merchantKey: string
  name: string
  at: string
}

/** Log of every user correction, used to measure and improve accuracy */
export interface CorrectionLog {
  id?: number
  at: string
  transactionId: string
  merchantKey: string
  aiCategoryId: string
  aiSource: CategorySource
  aiConfidence: number
  userCategoryId: string
  scope: 'one' | 'merchant'
}

/** Cached AI answer per merchant so each merchant is only ever sent once */
export interface MerchantInsight {
  merchantKey: string
  categoryId: string
  confidence: number
  subscriptionLikelihood: number
  suspiciousLikelihood: number
  source: 'ai' | 'fallback'
  at: string
}

/** "Any transaction whose bank wording contains ZENTROVA is the shop Zentrova" */
export interface NameKeyword {
  /** Upper case, e.g. "ZENTROVA" */
  keyword: string
  name: string
  at: string
}

/** A named set of filters for a page, e.g. "Base spending" on the dashboard */
export interface SavedView {
  id: string
  page: 'dashboard' | 'transactions'
  name: string
  /** The page's filters, as JSON */
  state: string
  at: string
}

export type FraudVerdict = 'legit' | 'not-me'

export interface FraudDecision {
  /** transaction id, or "merchant:<key>" for merchant-wide legit marks */
  key: string
  verdict: FraudVerdict
  at: string
}

export interface ImportRecord {
  id: string
  fileName: string
  readerId: string
  accountId: string
  at: string
  added: number
  skippedDuplicates: number
}

/** Remembered CSV column mapping for an unknown layout */
export interface CsvMapping {
  signature: string
  bank: string
  accountLabel: string
  dateColumn: number
  descriptionColumn: number
  /** Either one signed amount column, or separate debit/credit columns */
  amountColumn?: number
  debitColumn?: number
  creditColumn?: number
  /** Running balance, used only to check the reading */
  balanceColumn?: number
  dateFormat: DateFormat
  /** Some banks show spending as positive numbers */
  invertAmounts: boolean
  hasHeader: boolean
}

export type DateFormat = 'DMY' | 'MDY' | 'YMD'

/** A subscription as one audit saw it */
export interface AuditSubscription {
  merchantKey: string
  merchant: string
  categoryId: string
  cadence: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'
  /** Latest price, as a positive number */
  amount: number
  yearlyCost: number
  lastDate: string
  nextExpected: string
  /** The account it's charged to, so a later audit knows whether that account's statements are in */
  accountId: string
  active: boolean
}

/**
 * What one (quarterly) audit found. Kept so the next audit can tell which savings really happened.
 * Uploads within a few weeks of each other count as the same audit.
 */
export interface AuditSnapshot {
  id: string
  /** When this audit started */
  at: string
  /** When it was last brought up to date */
  updatedAt: string
  /** Latest transaction date it covered */
  dataThrough: string
  subscriptions: AuditSubscription[]
  /** Savings ideas shown at this audit */
  savingsFound: Array<{ id: string; kind: string; title: string; yearlySaving: number }>
}

/** A saving the data shows really happened: a subscription stopped, or its price came down */
export interface ConfirmedSaving {
  /** "<kind>:<merchantKey>:<baselineAuditId>" */
  key: string
  kind: 'cancelled' | 'cheaper'
  merchantKey: string
  merchant: string
  /** Price before and after (0 after when cancelled) */
  from: number
  to: number
  yearlySaving: number
  /** The earlier audit that saw the subscription at its old price */
  baselineAuditId: string
  confirmedAt: string
}
