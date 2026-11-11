import { NON_SPENDING } from './categories'
import type { Category, CategoryGroup, Transaction } from './types'

/** How much a transaction counts towards spending: purchases positive, refunds negative, transfers/income zero */
export function spendOf(t: Transaction): number {
  if (t.isTransfer || NON_SPENDING.has(t.categoryId)) return 0
  return -t.amount
}

export const monthOf = (isoDate: string) => isoDate.slice(0, 7)

export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function dateRange(transactions: Transaction[]): { first: string; last: string } | undefined {
  if (!transactions.length) return undefined
  let first = transactions[0].date
  let last = first
  for (const t of transactions) {
    if (t.date < first) first = t.date
    if (t.date > last) last = t.date
  }
  return { first, last }
}

/**
 * Months fully covered by the data. A statement that runs 15 Mar → 14 Mar covers
 * October..August fully; the partial months at each end would distort averages.
 */
export function fullMonths(transactions: Transaction[]): string[] {
  const r = dateRange(transactions)
  if (!r) return []
  const all = monthsBetween(monthOf(r.first), monthOf(r.last))
  const startsOnFirst = r.first.endsWith('-01') || r.first.slice(8) <= '03'
  const lastDay = new Date(Date.UTC(+r.last.slice(0, 4), +r.last.slice(5, 7), 0)).getUTCDate()
  const endsOnLast = +r.last.slice(8) >= lastDay - 2
  const out = all.slice(startsOnFirst ? 0 : 1, endsOnLast ? all.length : all.length - 1)
  return out.length ? out : all
}

export function sumBy<K>(transactions: Transaction[], key: (t: Transaction) => K): Map<K, number> {
  const out = new Map<K, number>()
  for (const t of transactions) {
    const s = spendOf(t)
    if (!s) continue
    const k = key(t)
    out.set(k, (out.get(k) ?? 0) + s)
  }
  return out
}

export interface MonthlyRow {
  month: string
  total: number
  [groupOrCategoryId: string]: number | string
}

/** Spending per month, split by a key (group or category), for charts */
export function monthlySeries(transactions: Transaction[], key: (t: Transaction) => string): MonthlyRow[] {
  const r = dateRange(transactions)
  if (!r) return []
  const rows = new Map<string, MonthlyRow>(monthsBetween(monthOf(r.first), monthOf(r.last)).map((m) => [m, { month: m, total: 0 }]))
  for (const t of transactions) {
    const s = spendOf(t)
    if (!s) continue
    const row = rows.get(monthOf(t.date))!
    const k = key(t)
    row[k] = ((row[k] as number) ?? 0) + s
    row.total += s
  }
  return [...rows.values()]
}

export function groupOfCategory(categories: Category[]): Map<string, string> {
  return new Map(categories.map((c) => [c.id, c.groupId]))
}

export interface Breakdown {
  id: string
  name: string
  color: string
  total: number
  share: number
}

export function breakdownByGroup(transactions: Transaction[], categories: Category[], groups: CategoryGroup[]): Breakdown[] {
  const gOf = groupOfCategory(categories)
  const sums = sumBy(transactions, (t) => gOf.get(t.categoryId) ?? 'other')
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  return groups
    .map((g) => ({ id: g.id, name: g.name, color: g.color, total: sums.get(g.id) ?? 0, share: total ? (sums.get(g.id) ?? 0) / total : 0 }))
    .filter((b) => b.total > 0.005)
    .sort((a, b) => b.total - a.total)
}

export const round2 = (n: number) => Math.round(n * 100) / 100
