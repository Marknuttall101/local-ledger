import { findKnownMerchant, GENERIC_NAMES } from './merchants'
import { BUSINESS_PAYMENT, PERSON_PAYMENT, stripBankPrefix } from './prefixes'

const COUNTRY_CODES = new Set(
  (
    'AUS USA GBR NZL CAN IRL NLD DEU FRA ESP ITA SGP HKG JPN CHN IND IDN THA VNM MYS PHL KOR ' +
    'CHE SWE NOR DNK FIN BEL AUT PRT GRC TUR ARE ISR ZAF BRA MEX ARG CHL LUX MLT CZE HUN POL ROU EST LTU LVA ' +
    'CYP ISL FJI TWN'
  ).split(' '),
)

/** Payment-processor prefixes that hide the real merchant name */
const PROCESSOR_PREFIXES = [
  /^PAYPAL \*/,
  /^PP\*/,
  /^SQ \*/,
  /^SQ\*/,
  /^SP /,
  /^SMP\*/,
  /^ZLR\*/,
  /^LS /,
  /^IZ \*/,
  /^DD \*/,
  /^GPAY\*/,
  /^TST\* /,
  /^CKO\*/,
  /^EFTPOS /,
  /^VISA PURCHASE /,
  /^DEBIT CARD PURCHASE /,
  /^EFTPOS PURCHASE /,
]

/** Words at the end of a description that are locations or legal suffixes, not the merchant */
const TRAILING_NOISE = new Set(
  (
    'SYDNEY MELBOURNE BRISBANE PERTH ADELAIDE HOBART CANBERRA DARWIN GOLD COAST NSW VIC QLD WA SA TAS ACT NT ' +
    'AU PTY LTD LIMITED LIMI CO INC LLC SOUT NORTH SOUTH EAST WEST EA'
  ).split(' '),
)

/** Refund rows repeat the merchant after a prefix: "CRED VOUCHER Coles Online ..." */
export function stripRefundPrefix(raw: string): string {
  return raw.replace(/^(CRED(IT)? VOUCHER|REFUND|RETURN|REVERSAL( OF)?|DEBIT CARD REFUND|EFTPOS CREDIT( \d+)?)\s+/i, '')
}

export function isRefundLike(raw: string): boolean {
  return stripRefundPrefix(raw) !== raw
}

/** Dates banks put inside descriptions: "23 AUG 2026", "23/09" */
const DATE_IN_TEXT = /\b\d{1,2} (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]* \d{2,4}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/gi

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR'])

/**
 * The person's name at the start of a payment description, without the note that follows:
 * "Casey K Example 12 MAR 2026" → "Casey K Example", "PAT SAMPLE Alex lunch" → "PAT SAMPLE",
 * "J Q DOE from Chris and Dana" → "J Q DOE". Keeps each person's payments together.
 */
export function personName(text: string): string {
  const words = text
    .replace(DATE_IN_TEXT, ' ')
    .replace(/[^A-Za-z&' -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out: string[] = []
  let long = 0
  let initial = false
  for (const w of words) {
    if (!out.length && TITLES.has(w.toUpperCase())) continue
    out.push(w)
    if (w.length === 1) initial = true
    else long++
    // Two full words ("Pat Sample"), or initials then a surname ("J Q Doe", "Casey K Example")
    if (long === 2 || (initial && w.length > 1) || out.length >= 4) break
  }
  return out.join(' ')
}

/** Split off the foreign-currency note Westpac appends ("FRGN AMT: 20.00 U. S. DOLLAR") */
export function splitForeignNote(raw: string): { description: string; note?: string } {
  const idx = raw.search(/\bFRGN AMT\b/i)
  if (idx === -1) return { description: raw.trim() }
  return { description: raw.slice(0, idx).trim(), note: raw.slice(idx).replace(/\s+/g, ' ').trim() }
}

/** Country code at the end of a card description, e.g. "... CASTELVARRO ITA" → "ITA" */
export function trailingCountry(raw: string): string | undefined {
  const last = splitForeignNote(raw).description.trim().split(/\s+/).pop()?.toUpperCase()
  return last && COUNTRY_CODES.has(last) ? last : undefined
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
    .replace(/\bAu\b/g, 'AU')
}

export function merchantKeyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Turn a raw bank description into a friendly merchant name and a stable key.
 * e.g. "PAYPAL *COLESSUPERM 5550001234 AUS" → { name: "Coles", key: "coles" }
 */
/** Bumped whenever cleanMerchant changes, so stored shop names are re-cleaned once */
export const CLEAN_VERSION = 4

/** Card codes banks put before the shop, e.g. "V1111" (Visa card ending 1111) */
const CARD_CODE = /\bV\d{4}\b/g

export function cleanMerchant(raw: string): { name: string; key: string } {
  const { name, key } = cleanParts(raw)
  return { name, key }
}

/** Words in the stripped-off tail that say where the shop is (legal words like "PTY" don't) */
const PLACE_WORDS = new Set(
  'SYDNEY MELBOURNE BRISBANE PERTH ADELAIDE HOBART CANBERRA DARWIN GOLD COAST NSW VIC QLD WA SA TAS ACT NT NORTH SOUTH EAST WEST'.split(' '),
)

/**
 * The town or state the bank put after the shop's name, e.g. "FENNICK TEAROOM SOUTH QLD" → "South QLD".
 * Helps the AI tell similar shop names apart. Undefined for well-known shops and payments
 * to people.
 */
export function placeOf(raw: string): string | undefined {
  return cleanParts(raw).place
}

function cleanParts(raw: string): { name: string; key: string; place?: string } {
  const base = stripBankPrefix(raw).replace(CARD_CODE, ' ').replace(/\s+/g, ' ').trim()
  // Banks sometimes glue numbers onto the name ("19:52NETFLIX"), so also look with them pulled apart
  const known = findKnownMerchant(base) ?? findKnownMerchant(base.replace(/(\d)(?=[A-Za-z])/g, '$1 '))
  if (known && !GENERIC_NAMES.has(known.name)) return { name: known.name, key: merchantKeyOf(known.name) }
  if (PERSON_PAYMENT.test(raw) && !BUSINESS_PAYMENT.test(raw)) {
    const name = titleCase(personName(base)) || titleCase(base)
    return { name, key: merchantKeyOf(name) }
  }

  let s = splitForeignNote(base)
    .description.toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(DATE_IN_TEXT, ' ')
    .replace(/\\/g, ' ')
    .trim()

  // Drop trailing country code
  const words = s.split(' ')
  if (words.length > 1 && COUNTRY_CODES.has(words[words.length - 1])) words.pop()
  s = words.join(' ')

  for (const p of PROCESSOR_PREFIXES) s = s.replace(p, '')

  // "PRIME VIDE* PRIME VIDE" style duplication: keep the part before the '*'
  s = s.replace(/^([^*]+)\*.*$/, '$1')

  s = s
    .replace(/\b[\w.-]*\.(COM|NET|ORG|IO|AI)(\.AU)?\b/g, (d) => d.replace(/\.(COM|NET|ORG|IO|AI)(\.AU)?$/, ''))
    .replace(/\bHELP\.[\w.]+/g, '')
    .replace(/^WWW\./, '')
    // Direct debits end in account/reference codes: "Varnholt Water VRNWTR4400000000"
    .replace(/\b\w*\d\w*\b/g, (tok) => (/^PAYMENT BY AUTHORITY/i.test(raw) ? '' : tok))
    // Booking references glued to names: "ZORBLINAIR4400000000000" → "ZORBLINAIR", "1A23BCD4567E8" → ""
    .replace(/\b\w*\d\w*\d\w*\b/g, (tok) => (tok.length < 6 ? tok : /^[A-Z]{3,}\d+$/.test(tok) ? tok.replace(/\d+$/, '') : ''))
    .replace(/\b\d{3,}-?/g, '') // store numbers, phone numbers, references
    .replace(/[#*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  let tokens = s
    .split(' ')
    .filter((w) => w && !/[_@]/.test(w))
    // Stray punctuation around words ("-PLUMWISE-", "TRANSITCARD.EXAMPLE/") and cut-off numbers ("03-")
    .filter((w) => !/^\d+-$/.test(w))
    .map((w) => w.replace(/^[-*/.]+|[-*/]+$/g, ''))
    .filter(Boolean)
  // Remove trailing locations / legal words and repeated trailing words ("QUILLMERE QUILLMERE")
  const removed: string[] = []
  let changed = true
  while (changed && tokens.length > 1) {
    changed = false
    const last = tokens[tokens.length - 1]
    if (TRAILING_NOISE.has(last) || last === tokens[tokens.length - 2]) {
      if (PLACE_WORDS.has(last) && last !== removed[0]) removed.unshift(last)
      tokens = tokens.slice(0, -1)
      changed = true
    }
  }
  // A single leftover word that is only noise means the description was all noise
  const name = titleCase(tokens.join(' ')) || titleCase(raw.trim())
  const place = removed.map((w) => (w.length <= 3 ? w : titleCase(w))).join(' ') || undefined
  return { name, key: merchantKeyOf(name), place }
}

const COMPANY_WORDS = /\bPty\.?(\s+(Ltd|Lt|L|Limited|Limi)\.?)?(?=\s|$)|\bP\/L\b|\b(Ltd|Limited|Inc|LLC)\.?(?=\s|$)/gi

/**
 * Text safe to send to the AI: the cleaned merchant name only, with digits, usernames and
 * email-like words removed.
 */
export function merchantTextForAi(merchantName: string): string {
  return merchantName
    // Company wording ("Pty Ltd", or cut short to "Pty L") tells the AI nothing about what the
    // shop sells, and pushes the suburb out of the first few words
    .replace(COMPANY_WORDS, ' ')
    .split(/\s+/)
    .filter((w) => !/[_@]/.test(w))
    .join(' ')
    .replace(/\d/g, '')
    .replace(/[^A-Za-z&' .,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    // A shop's name is in its first few words; anything after can be a personal note
    .slice(0, 4)
    .join(' ')
    .slice(0, 60)
}

/**
 * Descriptions that may contain a person's name (bank transfers, pay-anyone). These are never
 * sent to the AI.
 */
export function mayContainPersonalName(raw: string): boolean {
  // Payment apps between people, even when paid by card (e.g. "EFTPOS DEBIT ... Beem")
  if (/\b(BEEM|OSKO|PAYID|PAY ?ANYONE)\b/i.test(raw)) return true
  if (BUSINESS_PAYMENT.test(raw)) return false
  if (PERSON_PAYMENT.test(raw)) return true
  return /\b(TRANSFER|TFR|OSKO|PAY ?ANYONE|PAYID|DIRECT CREDIT|DIRECT DEBIT|DEPOSIT|SALARY|WAGES|BPAY|INTERNET BANKING|FAST PAYMENT|FROM|TO)\b/i.test(
    raw,
  )
}
