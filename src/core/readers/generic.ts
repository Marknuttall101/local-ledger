import type { CsvMapping, ParsedStatement, StatementInfo } from '../types'
import { bodyRows, csvSignature, guessCsvMapping, readCsvWithMapping } from './csv'
import type { PdfTable } from './pdfTable'
import { checkStatement } from './verify'

export const infoFromTable = (t: PdfTable, fileName: string): StatementInfo => ({
  kind: 'pdf',
  fileName,
  ...(t.bank ? { bank: t.bank } : {}),
  ...(t.accountSuffix ? { accountSuffix: t.accountSuffix } : {}),
  ...(t.opening !== undefined ? { opening: t.opening } : {}),
  ...(t.closing !== undefined ? { closing: t.closing } : {}),
})

/**
 * Identifies a layout so a confirmed mapping is reused. PDF and CSV layouts never mix, and PDF
 * layouts are kept per bank: many banks use the same column titles but different signs.
 */
export const signatureFor = (rows: string[][], info: StatementInfo) =>
  `${info.kind === 'pdf' ? `pdf:${(info.bank ?? 'unknown').toLowerCase()}:` : ''}${csvSignature(rows)}`

/** Read the rows with a mapping, then add what the file itself told us and check the result */
export function finishStatement(rows: string[][], mapping: CsvMapping, info: StatementInfo, readerId = `${info.kind}-general`): ParsedStatement {
  const statement = readCsvWithMapping(rows, mapping, readerId)
  return {
    ...statement,
    ...(info.bank ? { bank: info.bank } : {}),
    ...(info.accountSuffix ? { accountSuffix: info.accountSuffix } : {}),
    check: checkStatement(rows, mapping, statement.transactions, info),
  }
}

export type Decision = { status: 'recognised'; statement: ParsedStatement; mapping: CsvMapping } | { status: 'needs-mapping'; mapping: CsvMapping }

/**
 * Whether we can tell which way the money went without asking. The balances prove the amounts
 * but not their direction (flip every amount and they still add up), so this needs its own
 * evidence: separate money out/in columns, CR/DR markers, or signed amounts where — as on almost
 * every statement — most rows are spending.
 */
function directionIsClear(rows: string[][], m: CsvMapping, statement: ParsedStatement): boolean {
  if (m.amountColumn === undefined) return m.debitColumn !== undefined || m.creditColumn !== undefined
  const cells = bodyRows(rows, m).map((r) => r[m.amountColumn!] ?? '')
  if (cells.some((c) => /(CR|DR)\.?\s*$/i.test(c))) return true
  const signed = cells.some((c) => /^\s*[-+−(]|^\s*\$\s*-/.test(c))
  const out = statement.transactions.filter((t) => t.amount < 0).length
  return signed && out >= statement.transactions.length - out
}

/** Every row read, nothing contradicted by the balances, and the direction is clear */
function trustworthy(rows: string[][], m: CsvMapping, statement: ParsedStatement): boolean {
  const body = bodyRows(rows, m).length
  const tidy = statement.transactions.length > 0 && statement.warnings.length <= Math.max(1, body * 0.05)
  return tidy && statement.check?.status !== 'mismatch' && directionIsClear(rows, m, statement)
}

/**
 * For a layout we have no dedicated reader for: use a layout the user confirmed before, or guess.
 * Either goes straight to the preview only when it can be trusted; otherwise we ask which column
 * is which (starting from the remembered layout or the guess).
 */
export function decide(rows: string[][], info: StatementInfo, saved?: CsvMapping): Decision {
  if (saved) {
    const statement = finishStatement(rows, saved, info, `${info.kind}-saved`)
    // The user chose the direction for this layout, so only the reading itself is checked
    const body = bodyRows(rows, saved).length
    const ok = statement.transactions.length > 0 && statement.warnings.length <= Math.max(1, body * 0.05) && statement.check?.status !== 'mismatch'
    return ok ? { status: 'recognised', statement, mapping: saved } : { status: 'needs-mapping', mapping: saved }
  }
  const guess = guessCsvMapping(rows, info.fileName)
  const mapping: CsvMapping = {
    ...guess,
    signature: signatureFor(rows, info),
    bank: info.bank ?? guess.bank,
    accountLabel: info.bank ? `${info.bank} account` : guess.accountLabel,
  }
  const statement = finishStatement(rows, mapping, info)
  return trustworthy(rows, mapping, statement) ? { status: 'recognised', statement, mapping } : { status: 'needs-mapping', mapping }
}
