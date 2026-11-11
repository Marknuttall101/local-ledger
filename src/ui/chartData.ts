import { spendOf } from '../core/analytics'
import type { Transaction } from '../core/types'

/** The chart's catch-all series */
export const OTHER = 'other'

/** Colour-blind-safe series colours, always handed out in this order (validated with the dataviz checker) */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
export const OTHER_COLOR = '#898781'

export interface Series {
  id: string
  name: string
  color: string
}

/** The first `max` rows get their own series; the rest share one "Other" series */
export function pickSeries(rows: Series[], max = SERIES_COLORS.length): Series[] {
  const own = rows.slice(0, max)
  const rest = rows.length - own.length
  return rest > 0 ? [...own, { id: OTHER, name: `${rest} ${rest === 1 ? 'other' : 'others'}`, color: OTHER_COLOR }] : own
}

/**
 * Spending per month for each series id. Every month has every series (0 when nothing was spent),
 * so lines don't skip quiet months. Anything not in `ids` goes under OTHER, if that's one of them.
 * A month where refunds outweigh spending shows as 0, not below zero.
 */
export function monthlyTotals(txs: Transaction[], months: string[], seriesOf: (t: Transaction) => string, ids: string[]): Array<Record<string, string | number>> {
  const known = new Set(ids)
  const byMonth = new Map(months.map((m) => [m, Object.fromEntries([['month', m], ...ids.map((id) => [id, 0])]) as Record<string, string | number>]))
  for (const t of txs) {
    const s = spendOf(t)
    const row = byMonth.get(t.date.slice(0, 7))
    if (!s || !row) continue
    let id = seriesOf(t)
    if (!known.has(id)) {
      if (!known.has(OTHER)) continue
      id = OTHER
    }
    row[id] = Math.round(((row[id] as number) + s) * 100) / 100
  }
  for (const row of byMonth.values()) for (const id of ids) if ((row[id] as number) < 0) row[id] = 0
  return [...byMonth.values()]
}
