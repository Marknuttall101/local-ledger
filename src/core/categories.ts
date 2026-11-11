import type { Category, CategoryGroup } from './types'

export const TRANSFER_CATEGORY = 'transfers'
export const INCOME_CATEGORY = 'income'
export const UNCATEGORISED = 'uncategorised'

/** Colours are the validated colour-blind-safe categorical order; "Other" is neutral grey */
export const STARTER_GROUPS: CategoryGroup[] = [
  { id: 'food', name: 'Food & Drink', color: '#2a78d6' },
  { id: 'home', name: 'Home & Bills', color: '#eb6834' },
  { id: 'transport', name: 'Transport', color: '#1baf7a' },
  { id: 'entertainment', name: 'Entertainment', color: '#eda100' },
  { id: 'health', name: 'Health & Fitness', color: '#e87ba4' },
  { id: 'shopping', name: 'Shopping', color: '#008300' },
  { id: 'lifestyle', name: 'Lifestyle & Travel', color: '#4a3aa7' },
  { id: 'money', name: 'Fees & Finance', color: '#e34948' },
  { id: 'business', name: 'Business', color: '#0097a7' },
  { id: 'other', name: 'Other', color: '#898781' },
]

const c = (id: string, groupId: string, name: string, hint: string): Category => ({ id, groupId, name, hint })

export const STARTER_CATEGORIES: Category[] = [
  c('groceries', 'food', 'Groceries', 'Supermarkets and grocery stores such as Coles, Woolworths, Aldi, IGA'),
  c('dining', 'food', 'Dining Out', 'Restaurants, pubs, bars and sit-down meals'),
  c('cafes', 'food', 'Cafes & Coffee', 'Cafes, coffee shops, bakeries'),
  c('takeaway', 'food', 'Takeaway & Delivery', 'Fast food and food delivery such as Uber Eats, Menulog, DoorDash, McDonalds'),
  c('alcohol', 'food', 'Alcohol', 'Bottle shops and liquor stores such as Dan Murphys, BWS, Liquorland'),

  c('rent', 'home', 'Rent & Mortgage', 'Rent, mortgage repayments, strata'),
  c('utilities', 'home', 'Electricity, Gas & Water', 'Energy and water bills such as AGL, Origin, EnergyAustralia'),
  c('internet', 'home', 'Internet & Phone', 'Internet, mobile and phone plans such as Telstra, Optus, Vodafone'),
  c('insurance', 'home', 'Insurance', 'Home, car, health, life and CTP insurance such as AAMI, NRMA, Bupa, Medibank'),
  c('household', 'home', 'Household & Hardware', 'Hardware, furniture, homewares such as Bunnings, IKEA, Kmart home'),

  c('fuel', 'transport', 'Fuel', 'Petrol stations such as Ampol, BP, Shell, 7-Eleven fuel'),
  c('public-transport', 'transport', 'Public Transport', 'Opal, Myki, trains, buses, ferries'),
  c('rideshare', 'transport', 'Rideshare & Taxis', 'Uber rides, DiDi, taxis'),
  c('car', 'transport', 'Car & Parking', 'Parking, tolls, rego, servicing, car repairs'),

  c('streaming', 'entertainment', 'TV & Streaming', 'Video streaming subscriptions such as Netflix, Stan, Disney+, Prime Video, Binge, Foxtel'),
  c('music', 'entertainment', 'Music & Audio', 'Spotify, Apple Music, Audible, podcasts'),
  c('games', 'entertainment', 'Games & Apps', 'Games, app store purchases, game subscriptions'),
  c('events', 'entertainment', 'Movies & Events', 'Cinemas, concerts, tickets, sport events, event venues'),

  c('fitness', 'health', 'Fitness & Gym', 'Gyms, fitness classes, yoga, sports clubs, activewear'),
  c('medical', 'health', 'Medical & Pharmacy', 'Doctors, dentists, physio, imaging, pharmacies, chemists'),
  c('personal-care', 'health', 'Personal Care', 'Hairdressers, barbers, beauty, cosmetics'),

  c('online-shopping', 'shopping', 'Online Shopping', 'Amazon, eBay, Temu and other online marketplaces'),
  c('clothing', 'shopping', 'Clothing', 'Clothes, shoes, menswear, womenswear and accessories'),
  c('electronics', 'shopping', 'Electronics', 'JB Hi-Fi, Harvey Norman, Apple, tech gear'),
  c('general-retail', 'shopping', 'Department & General Stores', 'Big W, Target, Kmart, Myer, David Jones'),

  c('travel', 'lifestyle', 'Travel & Accommodation', 'Flights, hotels, Airbnb, travel agencies'),
  c('software', 'business', 'Software & Cloud', 'Software and app subscriptions, cloud storage, AI tools, Google One, iCloud (not accountants or other firms that provide a service)'),
  c('education', 'lifestyle', 'Education', 'Courses, tuition, books for study'),
  c('gifts', 'lifestyle', 'Gifts & Donations', 'Gifts, charities and donations'),
  c('kids-pets', 'lifestyle', 'Kids & Pets', 'Childcare, school, pet food, vets'),

  c('bank-fees', 'money', 'Bank Fees', 'Foreign transaction fees, cash advance fees, account fees, late fees'),
  c('interest', 'money', 'Interest Charges', 'Interest charged on credit cards or loans'),
  c('government', 'money', 'Tax & Government', 'ATO, Service NSW, fines, rego, council rates'),
  c('cash', 'money', 'Cash Withdrawals', 'ATM withdrawals and cash advances'),
  c('professional', 'business', 'Professional Services', 'Accountants, bookkeepers, tax agents, lawyers, consultants, financial advisers'),
  c('office', 'business', 'Office & Equipment', 'Office supplies, stationery, printers, computers and furniture for work, co-working spaces'),
  c('marketing', 'business', 'Advertising & Marketing', 'Online ads such as Google Ads, Meta and LinkedIn ads, printing and promotional material'),
  c('business-travel', 'business', 'Business Travel', 'Flights, hotels and transport for work trips'),

  c(UNCATEGORISED, 'other', 'Uncategorised', 'Anything that does not fit another category'),
  c(TRANSFER_CATEGORY, 'other', 'Transfers & Repayments', 'Moving money between your own accounts, card repayments'),
  c(INCOME_CATEGORY, 'other', 'Income & Refunds', 'Salary, refunds and money received'),
]

/** Bumped when starter categories are added or their descriptions improve */
export const STARTER_VERSION = 4

/** Colours starter groups used to have, so ones the user hasn't changed can be updated */
export const PREVIOUS_GROUP_COLORS: Record<string, string[]> = { business: ['#0e7c86'] }

/** Groups starter categories used to be in, so ones the user hasn't moved can follow */
export const PREVIOUS_GROUPS: Record<string, string> = {
  software: 'lifestyle',
  professional: 'money',
}

/** Descriptions as they were before an improvement, so untouched ones can be updated */
export const PREVIOUS_HINTS: Record<string, string[]> = {
  events: ['Cinemas, concerts, tickets, sport events'],
  clothing: ['Clothes, shoes and accessories'],
  software: ['Software subscriptions, cloud storage, AI tools, Google One, iCloud'],
}

/** Categories that are never counted as spending */
export const NON_SPENDING = new Set([TRANSFER_CATEGORY, INCOME_CATEGORY])

/** Colour for a group the user adds: the next unused palette slot, then neutral grey */
export const GROUP_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
