import { parseDate, parseMoney } from '../parse-utils'
import { splitForeignNote, trailingCountry } from '../clean'
import type { CsvMapping, DateFormat, ParsedStatement, ParsedTransaction } from '../types'
import type { BankReader, ReaderInput } from './types'

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z]+/g, ' ').trim()

/** Identifies a CSV layout so a mapping chosen once is reused for later files */
export function csvSignature(rows: string[][]): string {
  const first = rows.find((r) => r.some((c) => c.trim())) ?? []
  const looksLikeHeader = first.length > 0 && !first.some((c) => parseDate(c) || parseMoney(c) !== undefined)
  return looksLikeHeader ? `h:${first.map(norm).join('|')}` : `n:${first.length}`
}

/**
 * Pull card numbers, value dates and which-of-your-accounts notes out of descriptions:
 * "... Card xx1234 Value Date: 01/09/2026", "Takeaway dinner From: Main Account"
 */
function tidyDescription(desc: string): { text: string; note?: string } {
  const m = desc.match(/\s+(Card\s+x+\d+.*|Value Date:.*|(?:From|To): [^:]*?Account(?: To: [^:]*?Account)?)$/i)
  const text = (m ? desc.slice(0, m.index) : desc).replace(/\s+/g, ' ').trim()
  return m ? { text, note: m[1].replace(/Card\s+x+\d+/i, '').trim() || undefined } : { text }
}

/** The rows after any title row */
export function bodyRows(rows: string[][], mapping: CsvMapping): string[][] {
  return mapping.hasHeader ? rows.slice(rows.findIndex((r) => r.some((c) => c.trim())) + 1) : rows
}

/** "CR"/"DR" say which way the money went whatever the layout; plain +/− numbers follow `invert` */
export function amountFromCell(text: string, invert: boolean): number | undefined {
  const value = parseMoney(text)
  if (value === undefined) return undefined
  const t = text.trim()
  if (/CR\.?$/i.test(t) || t.startsWith('+')) return Math.abs(value)
  if (/DR\.?$/i.test(t)) return -Math.abs(value)
  return invert ? -value : value
}

/** The row's amount: one signed column, or money out/in columns */
export function amountOf(row: string[], mapping: CsvMapping): number | undefined {
  if (mapping.amountColumn !== undefined) return amountFromCell(row[mapping.amountColumn] ?? '', mapping.invertAmounts)
  const debit = parseMoney(row[mapping.debitColumn ?? -1] ?? '')
  const credit = parseMoney(row[mapping.creditColumn ?? -1] ?? '')
  if (debit === undefined && credit === undefined) return undefined
  const amount = Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
  return mapping.invertAmounts ? -amount : amount
}

/** Lines that state a balance rather than a transaction */
const BALANCE_LINE = /^(opening|closing) balance\b|^balance (brought|carried) forward/i
/** Fees whose amount is only in the description: "FOREIGN FEE AUD 1.02" */
const FEE_IN_TEXT = /^FOREIGN (?:TRANSACTION )?FEE\b(?!.*\b(?:REFUND|REVERSAL)\b).*?\bAUD\s+(?<amount>[\d,]*\.\d{2})\b/i

export function readCsvWithMapping(rows: string[][], mapping: CsvMapping, readerId = 'csv-mapped'): ParsedStatement {
  const warnings: string[] = []
  const transactions: ParsedTransaction[] = []
  bodyRows(rows, mapping).forEach((row, i) => {
    if (!row.some((c) => c.trim())) return
    const rawDesc = (row[mapping.descriptionColumn] ?? '').trim()
    const date = parseDate(row[mapping.dateColumn] ?? '', mapping.dateFormat)
    let amount = amountOf(row, mapping)
    // A line that only states a balance has no amount of its own
    if (amount === undefined && BALANCE_LINE.test(rawDesc)) return
    if (amount === undefined) {
      const fee = rawDesc.match(FEE_IN_TEXT)
      if (fee?.groups) amount = -(parseMoney(fee.groups.amount) ?? 0)
    }
    if (!date || amount === undefined || !rawDesc) {
      warnings.push(`Row ${i + 1 + (mapping.hasHeader ? 1 : 0)} skipped: couldn't read ${!date ? 'the date' : amount === undefined ? 'the amount' : 'the description'}`)
      return
    }
    if (amount === 0) return
    const tidied = tidyDescription(rawDesc)
    const { description, note: foreignNote } = splitForeignNote(tidied.text)
    const note = [foreignNote, tidied.note].filter(Boolean).join(' · ') || undefined
    const country = trailingCountry(description)
    const isFee = /^FOREIGN FEE/i.test(description)
    transactions.push({
      date,
      rawDescription: description,
      amount: Math.round(amount * 100) / 100,
      ...(note ? { note } : {}),
      ...(!isFee && (foreignNote || (country && country !== 'AUS')) ? { foreign: true } : {}),
    })
  })
  return { readerId, bank: mapping.bank, accountLabel: mapping.accountLabel, transactions, warnings }
}

/** Best guess at which column is which, for a layout we have never seen */
export function guessCsvMapping(rows: string[][], fileName = ''): CsvMapping {
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()))
  const first = nonEmpty[0] ?? []
  const hasHeader = first.length > 0 && !first.some((c) => parseDate(c) || parseMoney(c) !== undefined)
  const body = (hasHeader ? nonEmpty.slice(1) : nonEmpty).slice(0, 50)
  const cols = Math.max(0, ...nonEmpty.map((r) => r.length))
  const header = hasHeader ? first.map(norm) : []

  const share = (col: number, test: (s: string) => boolean) =>
    body.length ? body.filter((r) => test(r[col] ?? '')).length / body.length : 0

  // Date format: if any first number is > 12, it must be the day
  let dateFormat: DateFormat = 'DMY'
  const score = [...Array(cols).keys()].map((c) => share(c, (s) => !!parseDate(s)))
  const dateColumn = score.indexOf(Math.max(...score))
  const numericDates = body.map((r) => (r[dateColumn] ?? '').match(/^(\d{1,2})[/.-](\d{1,2})[/.-]/)).filter(Boolean)
  if (numericDates.some((m) => +m![2] > 12) && !numericDates.some((m) => +m![1] > 12)) dateFormat = 'MDY'

  const find = (re: RegExp) => header.findIndex((h) => re.test(h))
  let debitColumn = find(/\b(debits?|withdrawals?|money out|paid out)\b/)
  let creditColumn = find(/\b(credits?|deposits?|money in|paid in)\b/)
  let amountColumn = find(/^(amount|transaction amount|value|amount aud)$/)
  const balanceColumn = find(/\bbalance\b/)
  const numericCols = [...Array(cols).keys()].filter(
    (c) => c !== dateColumn && share(c, (s) => !s.trim() || parseMoney(s) !== undefined) > 0.9 && share(c, (s) => parseMoney(s) !== undefined) > 0.3,
  )

  if (amountColumn === -1 && (debitColumn === -1 || creditColumn === -1)) {
    // No helpful header: the first mostly-numeric column that isn't the balance
    debitColumn = creditColumn = -1
    // With no header the last numeric column is usually the running balance
    const candidates = numericCols.length > 1 ? numericCols.filter((c) => c !== balanceColumn && c !== numericCols[numericCols.length - 1]) : numericCols
    amountColumn = candidates[0] ?? -1
  }
  const usedForMoney = new Set([amountColumn, debitColumn, creditColumn])
  const balanceGuess = balanceColumn !== -1 ? balanceColumn : (numericCols.filter((c) => !usedForMoney.has(c)).pop() ?? -1)

  let descriptionColumn = find(/^transaction$|\b(description|narrative|details|transaction details|merchant|payee|particulars)\b/)
  if (descriptionColumn === -1) {
    const lengths = [...Array(cols).keys()].map((c) =>
      c === dateColumn || c === amountColumn || c === debitColumn || c === creditColumn
        ? -1
        : body.reduce((sum, r) => sum + (parseMoney(r[c] ?? '') === undefined ? (r[c] ?? '').length : 0), 0),
    )
    descriptionColumn = lengths.indexOf(Math.max(...lengths))
  }

  // Spending shown without any sign on every row → probably inverted (CR/DR still say which way)
  const invertAmounts =
    amountColumn !== -1 &&
    body.length > 3 &&
    body.some((r) => parseMoney(r[amountColumn] ?? '') !== undefined) &&
    !body.some((r) => /^\s*[-−(+]|^\s*\$\s*-|DR\.?\s*$/i.test(r[amountColumn] ?? ''))

  return {
    signature: csvSignature(rows),
    bank: 'Unknown bank',
    accountLabel: fileName.replace(/\.[^.]+$/, '') || 'Imported account',
    dateColumn,
    descriptionColumn,
    ...(amountColumn !== -1 ? { amountColumn } : { debitColumn, creditColumn }),
    ...(balanceGuess !== -1 ? { balanceColumn: balanceGuess } : {}),
    dateFormat,
    invertAmounts,
    hasHeader,
  }
}

interface Preset {
  id: string
  bank: string
  label: string
  matches(rows: string[][]): boolean
  mapping(rows: string[][]): Omit<CsvMapping, 'signature' | 'accountLabel'> & { accountLabel?: string }
}

const firstRow = (rows: string[][]) => rows.find((r) => r.some((c) => c.trim())) ?? []

const PRESETS: Preset[] = [
  {
    // CBA NetBank: no header — Date, Amount, Description, Balance
    id: 'cba-csv',
    bank: 'CommBank',
    label: 'CommBank account',
    matches: (rows) => {
      const r = firstRow(rows)
      return r.length === 4 && !!parseDate(r[0]) && /^[+-]?\d/.test(r[1].trim()) && /^[+-]\d/.test(r[3].trim())
    },
    mapping: () => ({ bank: 'CommBank', dateColumn: 0, amountColumn: 1, descriptionColumn: 2, dateFormat: 'DMY', invertAmounts: false, hasHeader: false }),
  },
  {
    // Westpac online banking export
    id: 'westpac-csv',
    bank: 'Westpac',
    label: 'Westpac account',
    matches: (rows) => {
      const h = firstRow(rows).map(norm)
      return h.includes('narrative') && h.includes('debit amount') && h.includes('credit amount')
    },
    mapping: (rows) => {
      const h = firstRow(rows).map(norm)
      return {
        bank: 'Westpac',
        dateColumn: h.indexOf('date'),
        descriptionColumn: h.indexOf('narrative'),
        debitColumn: h.indexOf('debit amount'),
        creditColumn: h.indexOf('credit amount'),
        dateFormat: 'DMY',
        invertAmounts: false,
        hasHeader: true,
      }
    },
  },
  {
    // ANZ: no header — Date, Amount, Description
    id: 'anz-csv',
    bank: 'ANZ',
    label: 'ANZ account',
    matches: (rows) => {
      const r = firstRow(rows)
      return r.length === 3 && !!parseDate(r[0]) && parseMoney(r[1]) !== undefined
    },
    mapping: () => ({ bank: 'ANZ', dateColumn: 0, amountColumn: 1, descriptionColumn: 2, dateFormat: 'DMY', invertAmounts: false, hasHeader: false }),
  },
  {
    // NAB: header with "Transaction Details"
    id: 'nab-csv',
    bank: 'NAB',
    label: 'NAB account',
    matches: (rows) => {
      const h = firstRow(rows).map(norm)
      return h.includes('transaction details') && h.includes('amount') && h.includes('date')
    },
    mapping: (rows) => {
      const h = firstRow(rows).map(norm)
      return {
        bank: 'NAB',
        dateColumn: h.indexOf('date'),
        amountColumn: h.indexOf('amount'),
        descriptionColumn: h.indexOf('transaction details'),
        dateFormat: 'DMY',
        invertAmounts: false,
        hasHeader: true,
      }
    },
  },
]

function presetReader(p: Preset): BankReader {
  return {
    id: p.id,
    bank: p.bank,
    detect: (input: ReaderInput) => (input.kind === 'csv' && p.matches(input.rows) ? 0.9 : 0),
    read(input) {
      if (input.kind !== 'csv') throw new Error('CSV reader needs a CSV')
      const mapping: CsvMapping = { accountLabel: p.label, ...p.mapping(input.rows), signature: csvSignature(input.rows) }
      return readCsvWithMapping(input.rows, mapping, p.id)
    },
  }
}

export const csvPresetReaders: BankReader[] = PRESETS.map(presetReader)

/** Mapping a preset would use, so the "which column is which" screen can start from it */
export function presetMapping(readerId: string, rows: string[][]): CsvMapping | undefined {
  const p = PRESETS.find((x) => x.id === readerId)
  return p && { accountLabel: p.label, ...p.mapping(rows), signature: csvSignature(rows) }
}
