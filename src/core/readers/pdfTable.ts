import { parseDate, type YearHint } from '../parse-utils'
import { groupLines, isMoneyText, splitRepeated, type Cell, type Line } from './pdfLines'
import { detectAccountSuffix, detectBank, detectPeriod, detectTotals, latestYear, spanOfDates } from './statementInfo'
import type { PdfItem } from './types'

export interface PdfTable {
  /** First row is the column titles; dates are YYYY-MM-DD */
  rows: string[][]
  bank?: string
  accountSuffix?: string
  period?: { from: string; to: string }
  opening?: number
  closing?: number
}

export interface Column {
  title: string
  role: 'date' | 'text' | 'money'
  x: number
  right: number
}

const DATE_TITLE = /^(date|transaction date|trans\.? date|txn date|posted|posting date|date posted|effective date|value date|processed|date processed)$/i
const MONEY_TITLE = /^(debits?|withdrawals?|paid out|money out|credits?|deposits?|paid in|money in|amount|amount \(\$\)|transaction amount|\$|balance|running balance)$/i

/** The line of column titles: has a date title and at least one money title */
function findHeader(lines: Line[]): Line | undefined {
  return lines.find((l) => l.cells.some((c) => DATE_TITLE.test(c.text)) && l.cells.some((c) => MONEY_TITLE.test(c.text)))
}

const columnsFromHeader = (header: Line): Column[] =>
  header.cells.map((c) => ({ title: c.text, role: DATE_TITLE.test(c.text) ? 'date' : MONEY_TITLE.test(c.text) ? 'money' : 'text', x: c.x, right: c.right }))

/** Which column a cell sits under. Amounts only go under money columns, words under the others. */
export function columnOf(cell: Cell, columns: Column[]): number {
  const money = isMoneyText(cell.text)
  const centre = (cell.x + cell.right) / 2
  let best = -1
  let bestDist = Infinity
  columns.forEach((col, i) => {
    if (money !== (col.role === 'money') && columns.some((c) => (c.role === 'money') === money)) return
    // Titles can be left-, centre- or right-aligned with what's under them: the closest edge wins
    const d = Math.min(Math.abs(cell.x - col.x), Math.abs(cell.right - col.right), Math.abs(centre - (col.x + col.right) / 2))
    if (d < bestDist) {
      best = i
      bestDist = d
    }
  })
  return best
}

const hasMoney = (l: Line) => l.cells.some((c) => isMoneyText(c.text))

/**
 * Undated lines that state a balance or total rather than continue a transaction. They are never
 * joined onto a row: "Balance carried forward" next to the last purchase on a page would otherwise
 * turn that purchase into a balance line. ("Gearloft Supplies" on a wrapped line has no amount, so it stays.)
 */
const isSummary = (l: Line) =>
  /^balance (carried|brought) forward|(carried|brought) forward$/i.test(l.text) ||
  (/^((opening|closing) balance|sub-?total|total)\b/i.test(l.text) && hasMoney(l))

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : undefined
}

/**
 * Turn a statement PDF into a grid like a CSV: one row per transaction, one column per title.
 * Works from where text sits on the page, so no bank-specific rules are needed.
 */
export function pdfToTable(items: PdfItem[]): PdfTable | undefined {
  const all = groupLines(items)
  const everything = all.map((l) => l.text).join('\n')
  const period = detectPeriod(everything)
  const hint: YearHint | undefined = period ?? spanOfDates(everything) ?? latestYear(everything)
  const header = findHeader(all)
  const columns = header ? columnsFromHeader(header) : inferColumns(all, hint)
  if (!columns) return undefined
  const dateCol = columns.findIndex((c) => c.role === 'date')
  if (dateCol === -1) return undefined

  const dateOf = (l: Line) => {
    const first = l.cells[0]
    return first && columnOf(first, columns) === dateCol ? parseDate(first.text, 'DMY', hint) : undefined
  }
  // The table starts below the titles (which repeat on each page)
  const notTitles = all.filter((l) => !header || l.text !== header.text)
  const belowTitles = (l: Line) => !header || l.page > header.page || l.y < header.y
  const dated = notTitles.filter((l) => belowTitles(l) && dateOf(l))
  if (!dated.length) return undefined

  // How far a wrapped line can sit from its row: most of the usual gap between rows
  const gaps: number[] = []
  for (let i = 1; i < dated.length; i++) if (dated[i].page === dated[i - 1].page) gaps.push(dated[i - 1].y - dated[i].y)
  const reach = (median(gaps) ?? 24) * 0.75

  // Where each page's transactions are, so a wrapped line there is never taken for a page footer
  const spans = new Map<number, { top: number; bottom: number }>()
  for (const d of dated) {
    const s = spans.get(d.page)
    spans.set(d.page, s ? { top: Math.max(s.top, d.y), bottom: Math.min(s.bottom, d.y) } : { top: d.y, bottom: d.y })
  }
  const inTable = (l: Line) => {
    const s = spans.get(l.page)
    return !!s && l.y <= s.top + reach && l.y >= s.bottom - reach
  }
  const { kept, furniture } = splitRepeated(notTitles, inTable)
  const table = kept.filter(belowTitles)
  const preamble = header ? all.filter((l) => l.page === header.page && l.y > header.y) : all.filter((l) => l.page === 1 && l.y > dated[0].y)
  const anchors = table.filter((l) => dateOf(l))

  const parts = new Map<Line, Line[]>(anchors.map((a) => [a, [a]]))
  let carried: Line[] = []
  for (const page of [...new Set(table.map((l) => l.page))].sort((a, b) => a - b)) {
    const onPage = table.filter((l) => l.page === page)
    const pageAnchors = onPage.filter((l) => parts.has(l))
    if (!pageAnchors.length) continue
    // Lines left over from the bottom of the previous page belong to this page's first row
    parts.get(pageAnchors[0])!.unshift(...carried)
    carried = []
    const lowest = pageAnchors[pageAnchors.length - 1]
    for (const l of onPage) {
      if (parts.has(l) || isSummary(l)) continue
      let best: Line | undefined
      let bestDist = Infinity
      for (const a of pageAnchors) {
        const d = Math.abs(a.y - l.y)
        if (d < bestDist) {
          best = a
          bestDist = d
        }
      }
      if (best && bestDist <= reach) parts.get(best)!.push(l)
      // Only words carry over: an amount down there isn't part of the next page's first row
      else if (l.y < lowest.y && !hasMoney(l)) carried.push(l)
    }
  }

  const rows = anchors.map((anchor) => {
    const cells: string[][] = columns.map(() => [])
    const lines = parts.get(anchor)!
    const ordered = [...lines.filter((l) => !parts.has(l) || l === anchor)]
    // Carried lines (from the previous page) come first, then top to bottom
    const carriedFirst = ordered.filter((l) => l.page < anchor.page)
    const samePage = ordered.filter((l) => l.page === anchor.page).sort((a, b) => b.y - a.y)
    for (const l of [...carriedFirst, ...samePage]) {
      for (const cell of l.cells) {
        const col = l === anchor && cell === anchor.cells[0] ? dateCol : columnOf(cell, columns)
        if (col >= 0) cells[col].push(cell.text)
      }
    }
    const row = cells.map((c) => c.join(' ').replace(/\s+/g, ' ').trim())
    row[dateCol] = dateOf(anchor)!
    return row
  })

  const firstPage = all.filter((l) => l.page === 1).map((l) => l.text).join('\n')
  return {
    rows: [columns.map((c) => c.title), ...rows],
    bank: detectBank([...furniture.map((l) => l.text), ...preamble.map((l) => l.text)], everything),
    accountSuffix: detectAccountSuffix(firstPage),
    ...(period ? { period } : {}),
    ...detectTotals(everything),
  }
}

/** Amount columns line up on their right edge (numbers are right-aligned) */
const SAME_COLUMN = 12

/**
 * For PDFs without column titles: rows start with a date and end with amounts. Group the amounts
 * by their right edge into columns: one column = amount; two = amount and balance; three = money
 * out, money in, balance.
 */
export function inferColumns(lines: Line[], hint?: YearHint): Column[] | undefined {
  const rows = lines.filter((l) => l.cells.length >= 3 && parseDate(l.cells[0].text, 'DMY', hint) && l.cells.slice(1).some((c) => isMoneyText(c.text)))
  if (rows.length < 3) return undefined
  const money = rows.flatMap((l) => l.cells.slice(1).filter((c) => isMoneyText(c.text)))
  const clusters: Array<{ right: number; x: number; count: number }> = []
  for (const c of [...money].sort((a, b) => a.right - b.right)) {
    const last = clusters[clusters.length - 1]
    if (last && c.right - last.right <= SAME_COLUMN) {
      last.right = Math.max(last.right, c.right)
      last.x = Math.min(last.x, c.x)
      last.count++
    } else clusters.push({ right: c.right, x: c.x, count: 1 })
  }
  const amountCols = clusters.filter((c) => c.count >= rows.length * 0.2)
  if (!amountCols.length) return undefined
  const titles = amountCols.length === 1 ? ['Amount'] : amountCols.length === 2 ? ['Amount', 'Balance'] : ['Debit', 'Credit', 'Balance', ...amountCols.slice(3).map((_, i) => `Amount ${i + 4}`)]
  const dateRight = Math.max(...rows.map((l) => l.cells[0].right))
  const descX = Math.min(...rows.map((l) => l.cells[1].x))
  return [
    { title: 'Date', role: 'date', x: Math.min(...rows.map((l) => l.cells[0].x)), right: dateRight },
    { title: 'Description', role: 'text', x: descX, right: amountCols[0].x - 1 },
    ...amountCols.map((c, i): Column => ({ title: titles[i], role: 'money', x: c.x, right: c.right })),
  ]
}
