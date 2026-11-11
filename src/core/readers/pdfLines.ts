import { parseMoney } from '../parse-utils'
import type { PdfItem } from './types'

/** A run of text on one line, with where it starts and ends across the page */
export interface Cell {
  text: string
  x: number
  right: number
}

export interface Line {
  page: number
  /** Height on the page (PDF units, bigger = higher up) */
  y: number
  cells: Cell[]
  text: string
}

/** Pieces whose heights differ by less than this sit on the same line */
const SAME_LINE = 3
/** Pieces closer than this (left to right) are one cell, e.g. "1,234.56" + "CR" */
const SAME_CELL = 4

/** Group a PDF's text pieces into lines, in reading order: page by page, top to bottom */
export function groupLines(items: PdfItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  const groups: Array<{ page: number; y: number; items: PdfItem[] }> = []
  for (const it of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) < SAME_LINE) last.items.push(it)
    else groups.push({ page: it.page, y: it.y, items: [it] })
  }
  return groups.map((g) => {
    const cells: Cell[] = []
    for (const it of g.items.sort((a, b) => a.x - b.x)) {
      const right = it.x + (it.width || it.str.length * 4.5)
      const prev = cells[cells.length - 1]
      if (prev && it.x - prev.right < SAME_CELL) {
        prev.text = `${prev.text} ${it.str}`.replace(/\s+/g, ' ').trim()
        prev.right = Math.max(prev.right, right)
      } else {
        cells.push({ text: it.str.replace(/\s+/g, ' ').trim(), x: it.x, right })
      }
    }
    return { page: g.page, y: g.y, cells, text: cells.map((c) => c.text).join(' ') }
  })
}

/** An amount with cents ("-$42.00", "1,234.56 CR"); years and reference numbers don't count */
export function isMoneyText(text: string): boolean {
  return /\d\.\d{2}\b/.test(text) && parseMoney(text) !== undefined
}

/**
 * Page headers and footers ("Page 2 of 8", the bank's address) repeat on most pages at the same
 * height. Transaction lines are kept even when their wording repeats: they sit at different
 * heights, and lines with an amount are always kept (the same fare can appear on every page).
 */
export function splitRepeated(lines: Line[], inTable: (l: Line) => boolean = () => false): { kept: Line[]; furniture: Line[] } {
  const pages = new Set(lines.map((l) => l.page)).size
  if (pages < 2) return { kept: lines, furniture: [] }
  const key = (l: Line) => `${Math.round(l.y / SAME_LINE)}|${l.text.replace(/\d/g, '#')}`
  const seenOn = new Map<string, Set<number>>()
  for (const l of lines) {
    const k = key(l)
    if (!seenOn.has(k)) seenOn.set(k, new Set())
    seenOn.get(k)!.add(l.page)
  }
  // Lines among the transactions are never furniture, even when rows sit on a fixed grid
  const repeats = (l: Line) => !inTable(l) && seenOn.get(key(l))!.size >= Math.max(2, pages * 0.5) && !l.cells.some((c) => isMoneyText(c.text))
  return { kept: lines.filter((l) => !repeats(l)), furniture: lines.filter(repeats) }
}
