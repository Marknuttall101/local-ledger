import { parseDate, parseMoney } from '../parse-utils'

/** Australian banks, most specific first (ubank before NAB; St.George before Westpac) */
const BANKS: Array<[RegExp, string]> = [
  [/\bubank\b/i, 'ubank'],
  [/St\.? ?George/i, 'St.George'],
  [/Bank of Melbourne/i, 'Bank of Melbourne'],
  [/\bBankSA\b/i, 'BankSA'],
  [/Commonwealth Bank|\bCommBank\b/i, 'CommBank'],
  [/Westpac/i, 'Westpac'],
  [/Australia and New Zealand Banking|\bANZ\b/, 'ANZ'],
  [/National Australia Bank|\bNAB\b/, 'NAB'],
  [/ING Bank|ing\.com\.au/i, 'ING'],
  [/Macquarie Bank/i, 'Macquarie'],
  [/Bendigo/i, 'Bendigo Bank'],
  [/Bank of Queensland|\bBOQ\b/, 'BOQ'],
  [/Bankwest/i, 'Bankwest'],
  [/Suncorp Bank/i, 'Suncorp'],
  [/Great Southern Bank/i, 'Great Southern Bank'],
  [/\bHSBC\b/, 'HSBC'],
  [/American Express|\bAmex\b/i, 'American Express'],
  [/Up Banking|up\.com\.au/i, 'Up'],
]

/**
 * Which bank a statement is from. The page header/footer and the top of page 1 are trusted first,
 * because transactions often name other banks ("Payment to Westpac").
 */
export function detectBank(priority: string[], everything: string): string | undefined {
  for (const text of priority) for (const [re, name] of BANKS) if (re.test(text)) return name
  let best: string | undefined
  let bestCount = 0
  for (const [re, name] of BANKS) {
    const count = everything.match(new RegExp(re.source, re.flags.includes('i') ? 'gi' : 'g'))?.length ?? 0
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

/** Last 4 digits of the card or account number (the full number is never kept) */
export function detectAccountSuffix(text: string): string | undefined {
  const m =
    text.match(/x{3,}\s?(\d{3,})/i) ??
    text.match(/\b\d{3}-\d{3}\s+(?:Account\s+)?(\d{4,10})\b/i) ??
    text.match(/Account (?:number|no\.?)\s*:?\s*([\d ]{6,20}\d)/i)
  return m ? m[1].replace(/\D/g, '').slice(-4) : undefined
}

const DATE = String.raw`\d{1,2}(?:st|nd|rd|th)?[\s-][A-Za-z]{3,9}[\s-,]+\d{4}|\d{1,2}/\d{1,2}/\d{2,4}`

/** "from 05-Oct-2025 to 05-Oct-2026", "5th Oct 2025 - 5th Oct 2026", "01/09/2026 – 30/09/2026" */
export function detectPeriod(text: string): { from: string; to: string } | undefined {
  const m = text.match(new RegExp(`(${DATE})\\s*(?:-|–|to)\\s*(${DATE})`, 'i'))
  if (!m) return undefined
  const from = parseDate(m[1])
  const to = parseDate(m[2])
  return from && to && from <= to ? { from, to } : undefined
}

/** Earliest to latest full date printed anywhere, for when the period is worded in an unusual way */
export function spanOfDates(text: string): { from: string; to: string } | undefined {
  const dates = [...text.matchAll(new RegExp(DATE, 'gi'))]
    .map((m) => parseDate(m[0]))
    .filter((d): d is string => !!d)
    .sort()
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : undefined
}

/** The latest year mentioned, for dates printed without one when there's no period */
export function latestYear(text: string): number | undefined {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1])
  return years.length ? Math.max(...years) : undefined
}

const MONEY = String.raw`[-−]?\$?[-−]?[\d,]+\.\d{2}(?:\s?(?:CR|DR))?`

/** Opening and closing balance printed on the statement, if any */
export function detectTotals(text: string): { opening?: number; closing?: number } {
  const find = (label: string) => {
    const m = text.match(new RegExp(`${label}[^\\d$−-]{0,40}(${MONEY})`, 'i'))
    return m ? parseMoney(m[1]) : undefined
  }
  const opening = find('Opening balance')
  const closing = find('Closing balance')
  return { ...(opening !== undefined ? { opening } : {}), ...(closing !== undefined ? { closing } : {}) }
}
