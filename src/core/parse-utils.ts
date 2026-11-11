import type { DateFormat } from './types'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCDate() !== d) return undefined
  return `${y}-${pad(m)}-${pad(d)}`
}

/** A year to use when a date is printed without one: a plain year, or the statement's period */
export type YearHint = number | { from: string; to: string }

const shiftDays = (isoDate: string, days: number) => new Date(Date.parse(isoDate) + days * 86_400_000).toISOString().slice(0, 10)

/**
 * Which year a day and month belong to: the latest one that falls inside the statement period
 * (give or take a month). Latest first, so a wide period never sends a date years back.
 */
function yearFor(month: number, day: number, hint?: YearHint): number | undefined {
  if (hint === undefined) return undefined
  if (typeof hint === 'number') return hint
  const toYear = +hint.to.slice(0, 4)
  const fromYear = +hint.from.slice(0, 4)
  for (let y = toYear; y >= fromYear; y--) {
    const d = iso(y, month, day)
    if (d && d >= shiftDays(hint.from, -31) && d <= shiftDays(hint.to, 31)) return y
  }
  return toYear
}

const monthNumber = (word: string) => MONTHS[word.slice(0, 3).toLowerCase()]

/**
 * Parse the date styles banks use: "23 Sep 2026", "5th Oct 2025", "Oct 5, 2026", "23-Sep-2026",
 * "23/09/2026", "2026-09-23". Dates printed without a year ("20 Dec", "05/01") take it from
 * `yearHint`. Numeric dates are read in the given order (Australian banks use day/month/year).
 */
export function parseDate(text: string, order: DateFormat = 'DMY', yearHint?: YearHint): string | undefined {
  const s = text
    .trim()
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\s+/g, ' ')
  let m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s-,]+(\d{2,4})$/)
  if (m) {
    const month = monthNumber(m[2])
    return month ? iso(+m[3], month, +m[1]) : undefined
  }
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/)
  if (m) {
    const month = monthNumber(m[1])
    return month ? iso(+m[3], month, +m[2]) : undefined
  }
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]]
    if (order === 'MDY') return iso(y, a, b)
    if (order === 'YMD') return undefined
    return iso(y, b, a)
  }
  // No year printed: take it from the statement
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?$/)
  if (m) {
    const month = monthNumber(m[2])
    const year = month ? yearFor(month, +m[1], yearHint) : undefined
    return month && year ? iso(year, month, +m[1]) : undefined
  }
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2})$/)
  if (m) {
    const month = monthNumber(m[1])
    const year = month ? yearFor(month, +m[2], yearHint) : undefined
    return month && year ? iso(year, month, +m[2]) : undefined
  }
  m = s.match(/^(\d{1,2})[/.](\d{1,2})$/)
  if (m) {
    const [day, month] = order === 'MDY' ? [+m[2], +m[1]] : [+m[1], +m[2]]
    const year = yearFor(month, day, yearHint)
    return year ? iso(year, month, day) : undefined
  }
  return undefined
}

/**
 * Parse money: "-$1,234.56", "$12.00", "(12.00)", "12.00 DR", "1234.5", "+$3.00".
 * Returns undefined for anything that is not clearly an amount.
 */
export function parseMoney(text: string): number | undefined {
  let s = text.trim().replace(/[−–]/g, '-')
  if (!s) return undefined
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (/\dDR\.?$|\sDR\.?$/i.test(s)) {
    sign = -1
    s = s.replace(/\s*DR\.?$/i, '')
  } else if (/\dCR\.?$|\sCR\.?$/i.test(s)) {
    s = s.replace(/\s*CR\.?$/i, '')
  }
  s = s.replace(/\s/g, '')
  if (s.startsWith('-')) {
    sign *= -1
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  s = s.replace(/^(A|AU|AUD)?\$/i, '')
  if (s.startsWith('-')) {
    sign *= -1
    s = s.slice(1)
  }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$|^\.\d+$/.test(s)) return undefined
  const value = Number(s.replace(/,/g, ''))
  return Number.isFinite(value) ? Math.round(sign * value * 100) / 100 : undefined
}
