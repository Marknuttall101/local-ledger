import type { Account, Transaction } from '../core/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const money0 = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`

/** "Everyday ···5678" — how an account is shown next to a transaction */
export function accountName(accounts: Account[], id: string): string {
  const a = accounts.find((x) => x.id === id)
  return a ? `${a.label}${a.suffix ? ` ···${a.suffix}` : ''}` : 'Unknown account'
}

/** "2026-09-23" → "23 Sep 2026" */
export const dateLabel = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`

/** A moment (e.g. when a file was imported) as "2026-09-23" in this device's time zone, not UTC */
export function localIsoDate(at: string | Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-09-23" → "23 Sep" */
export const shortDate = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`

/** "2026-09" → "Sep 26" */
export const monthShort = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`

/** "2026-09" → "September 2026" */
export const monthLong = (ym: string) =>
  new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`

export const cadenceLabel: Record<string, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}


/** Plain-English description of how a transaction got its category. `sample`: the built-in example, whose AI answers were recorded earlier, not asked for now */
export function sourceLabel(t: Transaction, sample = false): string {
  if (t.manualOverride || t.categorySource === 'user') return 'You (this transaction only)'
  switch (t.categorySource) {
    case 'rule':
      return t.categoryId === 'income' ? 'Money in' : 'Your choice for this shop'
    case 'builtin':
      return 'Known shop'
    case 'ai':
      return `${sample ? 'Saved AI answer' : 'AI'} (${Math.round(t.confidence * 100)}% sure)`
    case 'transfer':
      return 'Transfer between your accounts'
    default:
      return t.confidence > 0 ? 'Rough guess' : 'Not sorted yet'
  }
}
