import type { AiRequestItem, Classifier, ClassifierResult } from './categorise'
import { UNCATEGORISED } from './categories'
import type { Category } from './types'

/**
 * Offline stand-in for the AI: simple keyword guesses, used when the AI is unavailable (no key yet,
 * offline, or over the usage cap). Guesses are deliberately low-confidence so they are shown to
 * the user for a quick look rather than trusted.
 */
const KEYWORDS: Array<[RegExp, string]> = [
  [/\bRENT\b(?! ?A ?CAR)|\b(STRATA|MORTGAGE|HOME LOAN)\b/, 'rent'],
  [/\b(INSURANCE|INSURE|INSURER|ASSURANCE)\b/, 'insurance'],
  [/\b(MOBILE|TELCO|TELECOMS?|BROADBAND|INTERNET|NBN)\b/, 'internet'],
  [/\b(FARES?|OPAL|MYKI|TRANSIT|TRAINS?|RAIL|FERRY|FERRIES|BUS)\b/, 'public-transport'],
  [/\b(ENERGY|ELECTRICITY|GAS|WATER|UTILITIES)\b/, 'utilities'],
  [/\b(CAFE|COFFEE|ESPRESSO|BAKERY|BAKE|PATISSERIE|CROISSANT|BAKEHOUSE|ROASTERS?)\b/, 'cafes'],
  [/\b(SUSHI|RAMEN|KEBAB|PIZZA|PIZZERIA|BURGER|NOODLE|DUMPLING|BANH MI|THAI|PHO|FRIED CHICKEN|CHICKEN|TAKEAWAY|DELI|FOODHALL)\b/, 'takeaway'],
  [/\b(RESTAURANT|DINING|BISTRO|EATERY|KITCHEN|CUISINE|BRASSERIE|TAVERN|PUB|BAR|HOTEL|BREWERY|CELLAR|GRILL|TRATTORIA|IZAKAYA|VIETNAMESE|INDIAN)\b/, 'dining'],
  [/\b(LIQUOR|BOTTLE ?SHOP|WINE|CELLARS)\b/, 'alcohol'],
  [/\b(GYM|FITNESS|YOGA|PILATES|CROSSFIT|SPORTS? CENTRE?|SPORTS CENTR|PROTEIN|NUTRITION|SUPPLEMENTS?|REBEL)\b/, 'fitness'],
  [/\b(PHYSIO|PHYSIOTHERAPY|MEDICAL|CLINIC|DENTAL|DENTIST|PHARMACY|CHEMIST|IMAGING|OPTOMETRIST|SPECSAVERS|DOCTOR|HEALTH)\b/, 'medical'],
  [/\b(HAIR|BARBER|SALON|BEAUTY|NAILS|SPA|COSMETICS)\b/, 'personal-care'],
  [/\b(AIRLINES?|AIRWAYS|AIR|QANTAS|JETSTAR|HOSTEL|RESORT|MOTEL|MERCURE|NOVOTEL|IBIS|HILTON|TOURS?|TRAVEL|FLIGHT)\b/, 'travel'],
  [/\b(PARKING|CARPARK|TOLL|AUTO|MOTORS|TYRES?|MECHANIC|SERVICE CENTRE)\b/, 'car'],
  [/\b(CINEMA|THEATRE|THEATER|TICKETS?|CONCERT|MUSEUM|GALLERY|FESTIVAL|SHOW|GOLF|BOWLING)\b/, 'events'],
  [/\b(SOFTWARE|CLOUD|HOSTING|VPN|APP|AI|INC|LLC)\b/, 'software'],
  [/\b(CLOTHING|APPAREL|FASHION|SHOES|UNIQLO|ICONIC|JEWE\w*|JEWELLERY)\b/, 'clothing'],
  [/\b(HARDWARE|FURNITURE|HOMEWARES|STORAGE)\b/, 'household'],
  [/\b(POST|LPO|PASSPORT|COUNCIL|GOVERNMENT|OFFICE)\b/, 'government'],
  [/\b(MART|MARKET|GROCER|GROCERY|SUPERMARKET|FISH|SEAFOOD|BUTCHER|FRUIT)\b/, 'groceries'],
  [/\b(SCHOOL|COURSE|UNIVERSITY|TAFE|UDEMY|COURSERA)\b/, 'education'],
  [/\b(CHARITY|DONATION|FOUNDATION|TRUST)\b/, 'gifts'],
  [/\b(PET|VET|CHILDCARE|DAYCARE)\b/, 'kids-pets'],
]

const SUBSCRIPTION_HINT = /\b(SUBSCRIPTION|MEMBERSHIP|MONTHLY|PREMIUM|PLUS|PRO|SOFTWARE|CLOUD|VPN|GYM|FITNESS|APP|AI|INC|LLC)\b/

export function guessCategory(text: string, categoryIds: Set<string>): { categoryId: string; confidence: number } {
  const upper = text.toUpperCase()
  for (const [re, id] of KEYWORDS) if (re.test(upper) && categoryIds.has(id)) return { categoryId: id, confidence: 0.55 }
  return { categoryId: UNCATEGORISED, confidence: 0 }
}

export const fallbackClassifier: Classifier = {
  name: 'fallback',
  async classify(items: AiRequestItem[], categories: Category[], onProgress) {
    const ids = new Set(categories.map((c) => c.id))
    const results: ClassifierResult[] = items.map((it) => {
      const g = guessCategory(it.text, ids)
      return {
        merchantKey: it.merchantKey,
        categoryId: g.categoryId,
        confidence: g.confidence,
        subscriptionLikelihood: SUBSCRIPTION_HINT.test(it.text.toUpperCase()) ? 0.4 : 0.05,
        suspiciousLikelihood: 0,
        source: 'fallback' as const,
      }
    })
    onProgress?.(items.length, items.length)
    return results
  },
}
