import { stripBankPrefix } from './prefixes'

/**
 * Built-in list of common Australian merchants. Matching here is instant, free and
 * private — nothing is sent anywhere for these merchants.
 */
export interface KnownMerchant {
  pattern: RegExp
  name: string
  categoryId: string
  /** Known subscription service */
  subscription?: boolean
}

const m = (pattern: RegExp, name: string, categoryId: string, subscription = false): KnownMerchant => ({
  pattern,
  name,
  categoryId,
  subscription,
})

// Order matters: first match wins, so specific patterns come before general ones.
export const KNOWN_MERCHANTS: KnownMerchant[] = [
  // Fees & finance (bank-generated rows)
  m(/^FOREIGN (TRANSACTION )?FEE/, 'Foreign transaction fee', 'bank-fees'),
  m(/INTERNATIONAL TRANSACTION FEE|O\/SEAS TXN FEE|OVERSEAS TRANSACTION FEE/, 'Foreign transaction fee', 'bank-fees'),
  m(/^CASH ADVANCE FEE/, 'Cash advance fee', 'bank-fees'),
  m(/^LATE (PAYMENT )?FEE/, 'Late payment fee', 'bank-fees'),
  m(/^CARD FEE|REWARDS FEE|^ANNUAL FEE|^ACCOUNT FEE|^MONTHLY (ACCOUNT |PLAN )?FEE|^ACCOUNT KEEPING FEE/, 'Account fee', 'bank-fees'),
  m(/^INTEREST CHARGES?|^INTEREST CHARGED|^PURCHASE INTEREST|^CASH ADVANCE INTEREST/, 'Interest', 'interest'),
  m(/^CASH ADVANCE|^ATM WITHDRAWAL|^WITHDRAWAL ATM|^CASH OUT/, 'Cash withdrawal', 'cash'),
  m(/\bATO\b|AUSTRALIAN TAXATION/, 'ATO', 'government'),
  m(/HOME LOAN|MORTGAGE REPAYMENT|LOAN REPAYMENT/, 'Home loan', 'rent'),
  m(/\bSTRATA\b|BODY CORPORATE|OWNERS CORP/, 'Strata', 'rent'),
  m(/\bCOUNC(IL)?\b|\bRATES\b/, 'Council rates', 'government'),
  m(/^SALARY\b|\bPAYROLL\b|\bWAGES\b/, 'Salary', 'income'),
  m(/MCARE BENEFITS|MEDICARE/, 'Medicare', 'medical'),
  m(/SERVICE NSW|SERVICE VICTORIA|VICROADS|QLD TRANSPORT|TRANSPORT MAIN ROADS/, 'Service NSW / Rego', 'government'),

  // Business software & cloud subscriptions (several bill from overseas, so amounts wobble with the exchange rate)
  m(/\bXERO\b/, 'Xero', 'software', true),
  m(/\bMYOB\b/, 'MYOB', 'software', true),
  m(/QUICKBOOKS/, 'QuickBooks', 'software', true),
  m(/MAILCHIMP/, 'Mailchimp', 'software', true),
  m(/\bSLACK\b/, 'Slack', 'software', true),
  m(/ATLASSIAN|\bJIRA\b|\bTRELLO\b|BITBUCKET/, 'Atlassian', 'software', true),
  m(/ZOOM\.US|ZOOM VIDEO|ZOOM\.COM/, 'Zoom', 'software', true),
  m(/GITHUB/, 'GitHub', 'software', true),
  m(/AMAZON WEB SERVICES|\bAWS EMEA\b|^AWS\b/, 'Amazon Web Services', 'software', true),
  m(/SHOPIFY/, 'Shopify', 'software', true),
  m(/HUBSPOT/, 'HubSpot', 'software', true),
  m(/CALENDLY/, 'Calendly', 'software', true),
  m(/SQUARESPACE/, 'Squarespace', 'software', true),
  m(/WIX\.COM/, 'Wix', 'software', true),
  m(/GODADDY/, 'GoDaddy', 'software', true),
  m(/\bFIGMA\b/, 'Figma', 'software', true),
  m(/\bASANA\b/, 'Asana', 'software', true),
  m(/MONDAY\.COM/, 'monday.com', 'software', true),
  m(/CLICKUP/, 'ClickUp', 'software', true),
  m(/DOCUSIGN/, 'DocuSign', 'software', true),
  m(/LINKEDIN/, 'LinkedIn', 'software', true),
  m(/1PASSWORD|LASTPASS/, 'Password manager', 'software', true),

  // Groceries
  m(/COLESSUPERM|^COLES ONLINE|^COLES\b|COLES EXPRESS/, 'Coles', 'groceries'),
  m(/WOOLWORTHS|^WW METRO|^WOW\b|WOOLIES/, 'Woolworths', 'groceries'),
  m(/^ALDI\b|ALDI STORES/, 'Aldi', 'groceries'),
  m(/\bIGA\b|FOODWORKS|HARRIS FARM/, 'Independent grocer', 'groceries'),
  m(/COSTCO/, 'Costco', 'groceries'),

  // Takeaway & delivery
  m(/UBER ?\*? ?EATS|UBEREATS/, 'Uber Eats', 'takeaway'),
  m(/MENULOG/, 'Menulog', 'takeaway'),
  m(/DOORDASH/, 'DoorDash', 'takeaway'),
  m(/MCDONALDS|MCDONALD'S/, "McDonald's", 'takeaway'),
  m(/GUZMAN Y GOMEZ|\bGYG\b/, 'Guzman y Gomez', 'takeaway'),
  m(/HUNGRY JACK|\bKFC\b|DOMINOS|DOMINO'S|PIZZA HUT|OPORTO|NANDOS|NANDO'S|SUBWAY/, 'Fast food', 'takeaway'),

  // Cafes
  m(/STARBUCKS|GLORIA JEANS|MUFFIN BREAK|BOOST JUICE/, 'Cafe chain', 'cafes'),

  // Alcohol
  m(/DAN MURPHY|\bBWS\b|LIQUORLAND|FIRST CHOICE LIQ|VINTAGE CELLARS/, 'Bottle shop', 'alcohol'),

  // Transport
  m(/UBER ?\*? ?TRIP|^UBER\b(?!.*EATS)/, 'Uber', 'rideshare'),
  m(/\bDIDI\b|13CABS|SILVER SERVICE|\bOLA\b/, 'Taxi / rideshare', 'rideshare'),
  m(/TRANSPORTFORNSW|TFNSW|\bOPAL\b|MYKI|TRANSLINK|GO CARD|ADELAIDE METRO/, 'Public transport', 'public-transport'),
  m(/LINKT|E-?TOLL|ETOLL|ROAM TOLL|SECURE PARKING|WILSON PARKING|CARE PARK|PARKING/, 'Tolls & parking', 'car'),
  m(/AMPOL|CALTEX|\bBP\b|SHELL|7-ELEVEN|7 ELEVEN|UNITED PETROL|METRO PETROL|PAYLESS FUEL|\bFUEL\b|PETROL/, 'Fuel', 'fuel'),

  // Streaming & entertainment
  m(/NETFLIX/, 'Netflix', 'streaming', true),
  m(/\bSTAN\b|STAN\.COM/, 'Stan', 'streaming', true),
  m(/DISNEY ?PLUS|DISNEYPLUS|DISNEY\+/, 'Disney+', 'streaming', true),
  m(/PRIME VIDE|PRIMEVIDEO|PRIME VIDEO/, 'Prime Video', 'streaming', true),
  m(/AMZNPRIME|AMAZON PRIME/, 'Amazon Prime', 'streaming', true),
  m(/\bBINGE\b/, 'Binge', 'streaming', true),
  m(/FOXTEL|KAYO/, 'Foxtel / Kayo', 'streaming', true),
  m(/PARAMOUNT/, 'Paramount+', 'streaming', true),
  m(/YOUTUBE ?PREMIUM|GOOGLE \*?YOUTUBE/, 'YouTube Premium', 'streaming', true),
  m(/APPLE\.COM\/BILL|APPLE\.COM BILL|ITUNES/, 'Apple services', 'software', true),
  m(/SPOTIFY/, 'Spotify', 'music', true),
  m(/AUDIBLE/, 'Audible', 'music', true),
  m(/HOYTS|EVENT CINEMAS|VILLAGE CINEMAS|READING CINEMAS|PALACE CINEMA|DENDY/, 'Cinema', 'events'),
  m(/TICKETEK|TICKETMASTER|MOSHTIX|EVENTBRITE/, 'Tickets', 'events'),
  m(/STEAMGAMES|STEAM PURCHASE|PLAYSTATION|XBOX|NINTENDO/, 'Games', 'games'),

  // Software
  m(/GOOGLE ONE/, 'Google One', 'software', true),
  m(/GSUITE|GOOGLE WORKSPACE/, 'Google Workspace', 'software', true),
  m(/OPENAI|CHATGPT/, 'ChatGPT', 'software', true),
  m(/MICROSOFT|MSFT/, 'Microsoft', 'software', true),
  m(/ADOBE/, 'Adobe', 'software', true),
  m(/DROPBOX/, 'Dropbox', 'software', true),
  m(/ICLOUD/, 'iCloud', 'software', true),
  m(/CANVA/, 'Canva', 'software', true),

  // Bills
  m(/TELSTRA/, 'Telstra', 'internet', true),
  m(/OPTUS/, 'Optus', 'internet', true),
  m(/VODAFONE|\bTPG\b|IINET|AUSSIE BROADBAND|BELONG|AMAYSIM|BOOST MOBILE|SUPERLOOP/, 'Internet & phone', 'internet', true),
  m(/\bAGL\b|ORIGIN ENERGY|ENERGYAUSTRALIA|RED ENERGY|ALINTA/, 'Energy & water', 'utilities'),
  m(/\bAAMI\b|\bNRMA\b|\bRACV\b|\bRACQ\b|ALLIANZ|BUDGET DIRECT|YOUI|\bGIO\b|SUNCORP INS|QBE|BUPA|MEDIBANK|\bHCF\b|\bNIB\b|\bAHM\b/, 'Insurance', 'insurance'),

  // Shopping
  m(/AMAZON|AMZN/, 'Amazon', 'online-shopping'),
  m(/EBAY/, 'eBay', 'online-shopping'),
  m(/TEMU|SHEIN|ALIEXPRESS/, 'Online marketplace', 'online-shopping'),
  m(/BIG ?W\b|BIGW/, 'Big W', 'general-retail'),
  m(/KMART/, 'Kmart', 'general-retail'),
  m(/TARGET/, 'Target', 'general-retail'),
  m(/MYER|DAVID JONES/, 'Department store', 'general-retail'),
  m(/JB HI.?FI|HARVEY NORMAN|THE GOOD GUYS|OFFICEWORKS/, 'Electronics store', 'electronics'),
  m(/BUNNINGS|IKEA|MITRE 10|SPOTLIGHT|ADAIRS/, 'Home & hardware', 'household'),
  m(/UNIQLO|COTTON ON|\bH&M\b|ZARA|MYER|GLUE STORE|THE ICONIC|ASOS/, 'Clothing', 'clothing'),

  // Health
  m(/CHEMIST WAREHOUSE|PRICELINE|TERRY WHITE|PHARMACY|CHEMIST/, 'Pharmacy', 'medical'),
  m(/PHYSIO|MEDICAL|MEDCLINIC|DENTAL|IMAGING|RADIOLOGY|PATHOLOGY|HOSPITAL|DOCTOR/, 'Medical', 'medical'),
  m(/ANYTIME FITNESS|FITNESS FIRST|F45|SNAP FITNESS|PLUS FITNESS|GOODLIFE|JETTS|CROSSFIT|\bGYM\b|YOGA|PILATES/, 'Fitness', 'fitness', true),

  // Travel
  m(/QANTAS|VIRGIN AUST|JETSTAR|REX AIRLINES|AIRBNB|BOOKING\.COM|EXPEDIA|HOTELS\.COM|AGODA/, 'Travel', 'travel'),
]

/**
 * Built-in entries that only identify a *kind* of business. For these we keep the shop's own
 * name (e.g. "Quillmere Physio") and just use the category.
 */
export const GENERIC_NAMES = new Set([
  'Independent grocer', 'Fast food', 'Cafe chain', 'Bottle shop', 'Taxi / rideshare', 'Tolls & parking', 'Fuel',
  'Cinema', 'Tickets', 'Games', 'Internet & phone', 'Energy & water', 'Insurance', 'Online marketplace',
  'Department store', 'Electronics store', 'Home & hardware', 'Clothing', 'Pharmacy', 'Medical', 'Fitness', 'Travel',
])

export function findKnownMerchant(rawDescription: string): KnownMerchant | undefined {
  const upper = stripBankPrefix(rawDescription).toUpperCase()
  return KNOWN_MERCHANTS.find((k) => k.pattern.test(upper))
}

/** Merchant keys of known subscription services (same key format as cleanMerchant) */
export const SUBSCRIPTION_MERCHANTS: string[] = KNOWN_MERCHANTS.filter((k) => k.subscription && !GENERIC_NAMES.has(k.name)).map((k) =>
  k.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-'),
)
