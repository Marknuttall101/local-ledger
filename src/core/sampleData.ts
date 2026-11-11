import type { ParsedStatement, ParsedTransaction } from './types'

/**
 * A realistic, entirely made-up year of banking for "Alex", used by the "Try it with example
 * data" button. Every local shop and town in it is invented; only a few national chains appear,
 * so the built-in list has something to recognise. Deterministic so it looks the same every time.
 * It is built to show off every feature: overlapping streaming services, a forgotten
 * subscription, a price rise, fees, takeaway creeping up, a double charge and a card-testing charge.
 */

/** Tiny seeded random generator so the example is identical on every visit */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const r2 = (n: number) => Math.round(n * 100) / 100

/** Merchants in the example that the built-in list doesn't know; answers the AI would give */
export const SAMPLE_INSIGHTS: Record<string, { categoryId: string; confidence: number; subscription?: number; suspicious?: number }> = {
  'bramblecup-coffee-quillmere': { categoryId: 'cafes', confidence: 0.97 },
  'tinlantern-espresso-pellacombe': { categoryId: 'cafes', confidence: 0.95 },
  'komorebi-noodle-house-pellacombe': { categoryId: 'dining', confidence: 0.89 },
  'the-gilded-heron-tavern-quillmere': { categoryId: 'dining', confidence: 0.93 },
  'cantina-verdello-orrindale': { categoryId: 'dining', confidence: 0.87 },
  'ironfern-gym-orrindale': { categoryId: 'fitness', confidence: 0.98, subscription: 0.95 },
  'quillmere-physio': { categoryId: 'medical', confidence: 0.97 },
  'tidemark-barbers-orrindale': { categoryId: 'personal-care', confidence: 0.96 },
  'mindquill-app': { categoryId: 'software', confidence: 0.71, subscription: 0.92 },
  'skylark-mobile-pellacombe': { categoryId: 'internet', confidence: 0.94, subscription: 0.9 },
  'brightcoil-energy-billing': { categoryId: 'utilities', confidence: 0.95 },
  'cormorant-mutual-insure': { categoryId: 'insurance', confidence: 0.91 },
  'metrolink-fares-varnholt': { categoryId: 'public-transport', confidence: 0.92 },
  'tallowmere-property-rent': { categoryId: 'rent', confidence: 0.9 },
  'wagglewood-pet-supplies': { categoryId: 'kids-pets', confidence: 0.95 },
  'starvale-cinemas': { categoryId: 'events', confidence: 0.94 },
  'pellacombe-arts-theatre': { categoryId: 'events', confidence: 0.9 },
  'voltwise-electronics-varnholt': { categoryId: 'electronics', confidence: 0.93 },
  'qzt-digital-svc': { categoryId: 'uncategorised', confidence: 0.3, suspicious: 0.86 },
  'osteria-lumina-castelvarro': { categoryId: 'dining', confidence: 0.9 },
  'libreria-del-ponte-castelvarro': { categoryId: 'travel', confidence: 0.6 },
}

export function generateSampleStatements(today = new Date('2026-08-14T00:00:00Z')): ParsedStatement[] {
  const rand = rng(73019)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const between = (a: number, b: number) => r2(a + rand() * (b - a))

  const start = addDays(today, -364)
  const card: ParsedTransaction[] = []
  const everyday: ParsedTransaction[] = []
  const add = (list: ParsedTransaction[], date: Date, rawDescription: string, amount: number, extra: Partial<ParsedTransaction> = {}) => {
    if (date > today || date < start) return
    list.push({ date: iso(date), rawDescription, amount: r2(amount), ...extra })
  }

  // Monthly/fortnightly/quarterly rhythm helper
  const every = (firstOffset: number, stepDays: number, fn: (d: Date, i: number) => void) => {
    for (let i = 0, d = addDays(start, firstOffset); d <= today; i++, d = addDays(d, stepDays)) fn(d, i)
  }
  const monthlyOn = (day: number, fn: (d: Date, i: number) => void) => {
    for (let i = 0; i < 13; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, day))
      fn(d, i)
    }
  }
  const monthsAgo = (d: Date) => (today.getTime() - d.getTime()) / (30.4 * 86_400_000)

  // ---- Everyday account: salary, rent, bills, card repayments
  every(5, 14, (d) => add(everyday, d, 'SALARY ACME PTY LTD', 2984.4))
  monthlyOn(2, (d) => add(everyday, d, 'TALLOWMERE PROPERTY RENT 7720', -2450))
  every(18, 91, (d, i) => add(everyday, d, 'BRIGHTCOIL ENERGY BILLING', -between(210, 295) - (i === 2 ? 45 : 0)))
  monthlyOn(16, (d) => add(everyday, d, 'CORMORANT MUTUAL INSURE 55190', -83.15))
  every(38, 7, (d) => add(everyday, d, `WOOLWORTHS ${pick(['3318', '3342'])} QUILLMERE`, -between(48, 132)))
  every(11, 30, (d) => add(everyday, d, 'ATM WITHDRAWAL QUILLMERE', -pick([40, 80])))

  // ---- Credit card
  monthlyOn(4, (d) => add(card, d, 'NETFLIX.COM AUS', d < new Date('2026-03-01') ? -16.49 : -18.49))
  monthlyOn(8, (d) => add(card, d, 'DISNEY PLUS AUS', -14.49))
  monthlyOn(11, (d) => add(card, d, 'SPOTIFY AUS', -12.49))
  monthlyOn(21, (d) => add(card, d, 'AMAZON PRIME AUS', -9.49))
  monthlyOn(6, (d) => add(card, d, 'SKYLARK MOBILE PELLACOMBE AUS', d < new Date('2026-05-01') ? -55 : -62))
  every(6, 14, (d) => add(card, d, 'IRONFERN GYM ORRINDALE AUS', -31.5))
  add(card, addDays(start, 52), 'MINDQUILL APP USA', -94.99, { foreign: true, note: 'FRGN AMT: 61.99 U. S. DOLLAR' })
  add(card, addDays(start, 52), 'FOREIGN FEE AUD 2.85', -2.85)

  every(2, 1, (d) => {
    const dow = d.getUTCDay()
    const recent = monthsAgo(d) < 3
    if (dow >= 1 && dow <= 5 && rand() < 0.5) add(card, d, pick(['BRAMBLECUP COFFEE QUILLMERE AUS', 'TINLANTERN ESPRESSO PELLACOMBE AUS']), -pick([4.6, 5.3, 5.8, 10.4]))
    if (rand() < (recent ? 0.28 : 0.12)) add(card, d, 'UBER *EATS HELP.UBER.COM AUS', -between(21, 58))
    if (rand() < 0.11) add(card, d, 'METROLINK FARES VARNHOLT AUS', -between(2.9, 8.8))
    if (rand() < 0.06) add(card, d, pick(['KOMOREBI NOODLE HOUSE PELLACOMBE AUS', 'THE GILDED HERON TAVERN QUILLMERE AUS', 'CANTINA VERDELLO ORRINDALE AUS']), -between(16, 79))
    if (rand() < 0.08) add(card, d, 'PAYPAL *COLESSUPERM 5550001234 AUS', -between(28, 115))
    if (rand() < 0.05) add(card, d, 'AMAZON AU MARKETPLACE AUS', -between(11, 84))
    if (rand() < 0.04) add(card, d, 'UBER *TRIP HELP.UBER.COM AUS', -between(12, 41))
    if (rand() < 0.03) add(card, d, 'FENNICK BAY FUEL 2087 AUS', -between(55, 98))
  })
  every(27, 42, (d) => add(card, d, 'TIDEMARK BARBERS ORRINDALE AUS', -36))
  every(55, 75, (d) => add(card, d, 'QUILLMERE PHYSIO AUS', -88))
  every(22, 60, (d) => add(card, d, 'WAGGLEWOOD PET SUPPLIES AUS', -between(41, 86)))
  add(card, addDays(today, -73), 'STARVALE CINEMAS AUS', -42)
  add(card, addDays(today, -141), 'PELLACOMBE ARTS THEATRE AUS', -164.5)
  add(card, addDays(today, -212), 'VOLTWISE ELECTRONICS VARNHOLT AUS', -389)

  // An overseas trip, with its foreign fees
  const trip = addDays(today, -118)
  for (let i = 0; i < 6; i++) {
    const d = addDays(trip, i)
    const amt = between(35, 170)
    const raw = pick(['OSTERIA LUMINA CASTELVARRO ITA', 'LIBRERIA DEL PONTE CASTELVARRO ITA'])
    add(card, d, raw, -amt, { foreign: true, note: `FRGN AMT: ${(amt * 0.6).toFixed(2)} EURO` })
    add(card, d, `FOREIGN FEE AUD ${(amt * 0.03).toFixed(2)}`, -r2(amt * 0.03))
  }
  // A double charge, and a card-testing charge followed by a larger one
  const dbl = addDays(today, -19)
  add(card, dbl, 'THE GILDED HERON TAVERN QUILLMERE AUS', -92.4)
  add(card, dbl, 'THE GILDED HERON TAVERN QUILLMERE AUS', -92.4)
  add(card, addDays(today, -10), 'QZT DIGITAL SVC 3391 USA', -0.99, { foreign: true })
  add(card, addDays(today, -7), 'CASH ADVANCE FEE', -4)
  add(card, addDays(today, -5), 'INTEREST CHARGES', -21.37)

  // Pay the card off each month from the everyday account (transfers — not spending)
  card.sort((a, b) => a.date.localeCompare(b.date))
  monthlyOn(25, (d) => {
    if (d > today || d < start) return
    const owed = -card.filter((t) => t.date < iso(d) && t.date >= iso(addDays(d, -31)) && t.amount < 0).reduce((s, t) => s + t.amount, 0)
    if (owed < 1) return
    add(everyday, d, 'PAYMENT TO CREDIT CARD 9021', -owed)
    add(card, addDays(d, 1), 'PAYMENT - THANK YOU', owed)
  })

  const byDate = (a: ParsedTransaction, b: ParsedTransaction) => b.date.localeCompare(a.date)
  return [
    { readerId: 'sample', bank: 'Example Bank', accountLabel: 'Everyday account', accountSuffix: '6083', transactions: everyday.sort(byDate), warnings: [] },
    { readerId: 'sample', bank: 'Example Bank', accountLabel: 'Example credit card', accountSuffix: '9021', transactions: card.sort(byDate), warnings: [] },
  ]
}
