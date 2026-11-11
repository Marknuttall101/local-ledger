import { splitForeignNote, trailingCountry } from '../clean'
import { isOwnNamePayment } from '../transfers'
import { parseDate, parseMoney } from '../parse-utils'
import type { ParsedTransaction } from '../types'
import type { BankReader, PdfItem, ReaderInput } from './types'

const DATE_RE = /^\d{2} [A-Z][a-z]{2} \d{4}$/
const MONEY_RE = /^-?\$[\d,]+\.\d{2}$/
/** How far (in PDF units) a line can sit above/below its date and still belong to it */
const ROW_REACH = 12
/** Page footers (copyright, ABN, page numbers) sit below this height */
const FOOTER_TOP = 88
const FOOTER_RE = /Westpac Banking Corporation|^ABN |^Page( \d+ of \d+)?$|^Date created|^Copyright|^: \d/

/**
 * Westpac "Statement of recent transactions" PDF (credit cards and everyday accounts).
 * Layout: Date | Description | Withdrawal | Deposit. The date sits at the vertical middle
 * of each row; long descriptions wrap onto a line above and below it.
 */
export const westpacPdfReader: BankReader = {
  id: 'westpac-pdf',
  bank: 'Westpac',

  detect(input) {
    if (input.kind !== 'pdf') return 0
    const hasBank = /Westpac Banking Corporation/i.test(input.text)
    const hasLayout = /Statement of recent transactions|Transactions report/i.test(input.text) && /Withdrawal/.test(input.text)
    return hasBank && hasLayout ? 1 : hasBank ? 0.4 : 0
  },

  read(input: ReaderInput) {
    if (input.kind !== 'pdf') throw new Error('Westpac reader needs a PDF')
    const warnings: string[] = []
    const items = input.items.filter((i) => i.str.trim())

    const title = items.find((i) => /\b(Card|Account|Saver|Everyday)\b/i.test(i.str) && i.page === 1 && i.y > 680)
    const accountLabel = title?.str.trim() ?? 'Westpac account'
    // Card numbers look like "xxxxxxxxxx123456"; account numbers like "000-000 12345678" (BSB + account)
    const numberItem = items.find((i) => /^x+\d{3,}$/i.test(i.str.trim()) || /^\d{3}-\d{3}\s+\d{4,}$/.test(i.str.trim()))
    const accountSuffix = numberItem?.str.replace(/\D/g, '').slice(-4)

    // The account holder's name (top-left of page 1) — used only to spot transfers to yourself,
    // never stored
    const holder = items.find((i) => i.page === 1 && i.x < 100 && i.y > 640 && i.y < 680 && /^[A-Z][A-Z' -]+ [A-Z][A-Z' -]+$/.test(i.str.trim()))?.str.trim()

    const header = items.find((i) => i.str.trim() === 'Description')
    const descLeft = header ? header.x - 10 : 125
    const withdrawalHeader = items.find((i) => i.str.trim() === 'Withdrawal')
    const amountLeft = withdrawalHeader ? withdrawalHeader.x - 40 : 340
    // Everyday-account reports have a running Balance column, which is not part of the amount
    const balanceHeader = items.find((i) => i.str.trim() === 'Balance' && i.y < 800 && i.x > amountLeft)
    const balanceLeft = balanceHeader ? balanceHeader.x - 40 : Infinity

    const pages = new Map<number, PdfItem[]>()
    for (const it of items) {
      if (!pages.has(it.page)) pages.set(it.page, [])
      pages.get(it.page)!.push(it)
    }

    const transactions: ParsedTransaction[] = []
    // Lines at the bottom of a page that belong to a row continuing on the next page
    let carried: PdfItem[] = []
    for (const [page, pageItems] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
      const dates = pageItems
        .filter((i) => i.x < descLeft && DATE_RE.test(i.str.trim()))
        .sort((a, b) => b.y - a.y)
      if (!dates.length) continue
      const lowestDateY = dates[dates.length - 1].y

      const rows = dates.map((d) => ({ date: d, desc: [] as PdfItem[], amounts: [] as PdfItem[] }))
      // Carried lines go first in the top row of this page (lifted above it so they sort first)
      for (const c of carried) rows[0][MONEY_RE.test(c.str.trim()) ? 'amounts' : 'desc'].push({ ...c, y: rows[0].date.y + ROW_REACH })
      carried = []
      for (const it of pageItems) {
        if (dates.includes(it)) continue
        if (it.x < descLeft) continue
        if (it.y < lowestDateY - ROW_REACH && it.y > FOOTER_TOP && !FOOTER_RE.test(it.str)) {
          carried.push(it)
          continue
        }
        // nearest date row on this page
        let best: (typeof rows)[number] | undefined
        let bestDist = Infinity
        for (const r of rows) {
          const dist = Math.abs(r.date.y - it.y)
          if (dist < bestDist) {
            best = r
            bestDist = dist
          }
        }
        if (!best || bestDist > ROW_REACH) continue
        const s = it.str.trim()
        if (it.x >= balanceLeft) continue
        if (it.x >= amountLeft && MONEY_RE.test(s)) best.amounts.push(it)
        else if (it.x < amountLeft) best.desc.push(it)
      }

      for (const r of rows) {
        const date = parseDate(r.date.str)
        // Top-to-bottom, then left-to-right
        const text = r.desc
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((i) => i.str.trim())
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!date || !text) {
          warnings.push(`Skipped an unreadable row on page ${page}`)
          continue
        }
        let amount: number | undefined
        if (r.amounts.length) {
          amount = r.amounts.map((a) => parseMoney(a.str) ?? 0).reduce((a, b) => a + b, 0)
        } else {
          // Fee rows carry their amount in the description: "FOREIGN FEE AUD 0.75 ..."
          const fee = text.match(/\bFEE AUD\s+([\d,]*\.\d{2})/i)
          if (fee) amount = -(parseMoney(fee[1]) ?? 0)
        }
        if (amount === undefined) {
          warnings.push(`No amount found for "${text}" on ${date}`)
          continue
        }
        const { description, note } = splitForeignNote(text)
        const country = trailingCountry(description)
        const isFeeRow = /^FOREIGN FEE/i.test(description)
        transactions.push({
          date,
          rawDescription: description,
          amount: Math.round(amount * 100) / 100,
          ...(note ? { note } : {}),
          ...(!isFeeRow && (note || (country && country !== 'AUS')) ? { foreign: true } : {}),
          ...(holder && isOwnNamePayment(description, holder) ? { ownTransfer: true } : {}),
        })
      }
    }

    return { readerId: this.id, bank: this.bank, accountLabel, accountSuffix, transactions, warnings }
  },
}
