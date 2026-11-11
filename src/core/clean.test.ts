import { describe, expect, it } from 'vitest'
import { cleanMerchant, mayContainPersonalName, merchantTextForAi, placeOf, splitForeignNote, trailingCountry } from './clean'

describe('cleanMerchant', () => {
  it.each([
    ['PAYPAL *COLESSUPERM 5550001234 AUS', 'Coles'],
    ['Coles Online Pellacombe AUS', 'Coles'],
    ['WOOLWORTHS      3318 QUILLMERE AUS', 'Woolworths'],
    ['WW METRO        6604 ORRINDALE AUS', 'Woolworths'],
    ['UBER *EATS HELP.UBER.COM AUS', 'Uber Eats'],
    ['UBER* EATS VARNHOLT AUS', 'Uber Eats'],
    ['UBER *TRIP HELP.UBER.COM AUS', 'Uber'],
    ['PRIME VIDE* PRIME VIDE QUILLMERE AUS', 'Prime Video'],
    ['AMZNPRIMEA* AMZNPRIMEA PELLACOMBE AUS', 'Amazon Prime'],
    ['MYKI TOPUP VARNHOLT AUS', 'Public transport'],
    ['FOREIGN FEE AUD 0.45 FRGN AMT: 10.00 U. S. DOLLAR', 'Foreign transaction fee'],
  ])('%s → %s (built-in)', (raw, name) => {
    expect(cleanMerchant(raw).name).toBe(name)
  })

  it.each([
    ['Gloamwick NSW NSW AUS', 'Gloamwick'],
    ['TALLOWMART ORRINDALE ORRINDALE AUS', 'Tallowmart Orrindale'],
    ['SP FERNLEDGE BEAN COFF PELLACOM AUS', 'Fernledge Bean Coff Pellacom'],
    ['4471-CORNER PANTRY ORR ORRINDALE AUS', 'Corner Pantry Orr Orrindale'],
    ['SQ *BRAMBLECUP COFFEE QUILL QLD AUS', 'Bramblecup Coffee Quill'],
    ['ZYLOQUAD-SHOP-STORE CASTELVARRO ITA', 'Zyloquad-Shop-Store Castelvarro'],
    ['QUORVENTA PTY LTD NSW AUS', 'Quorventa'],
  ])('%s → %s (heuristic)', (raw, name) => {
    expect(cleanMerchant(raw).name).toBe(name)
  })

  it('gives the same key to the same merchant at different stores', () => {
    expect(cleanMerchant('COLES 0719 VARNHOLT AUS').key).toBe(cleanMerchant('PAYPAL *COLESSUPERM 5550001234 AUS').key)
  })
})

describe('foreign details', () => {
  it('splits the FRGN AMT note', () => {
    expect(splitForeignNote('ZENTROVA CLOUD SVCS EXAMPLE USA FRGN AMT: 10.00 U. S. DOLLAR')).toEqual({
      description: 'ZENTROVA CLOUD SVCS EXAMPLE USA',
      note: 'FRGN AMT: 10.00 U. S. DOLLAR',
    })
  })
  it('finds trailing country codes', () => {
    expect(trailingCountry('ZYLOQUAD-SHOP-STORE CASTELVARRO ITA')).toBe('ITA')
    expect(trailingCountry('Tidemark Barbers Orrindale AUS')).toBe('AUS')
    expect(trailingCountry('AUTOMATIC PAYMENT')).toBeUndefined()
  })
})

describe('privacy helpers', () => {
  it('strips digits and usernames from AI text', () => {
    expect(merchantTextForAi('Google Gsuite_sampleuser 482')).toBe('Google')
  })
  it('flags transfer-like descriptions', () => {
    expect(mayContainPersonalName('OSKO PAYMENT TO JORDAN EXAMPLE')).toBe(true)
    expect(mayContainPersonalName('Tidemark Barbers Orrindale AUS')).toBe(false)
  })
})

describe('reference numbers and refunds', () => {
  it.each([
    ['ZORBLINAIR4400000000000 QLD AUS', 'Zorblinair'],
    ['PELLAFLY4400000000000 VIC AUS', 'Pellafly'],
    ['GRPN 7b31qx9204k2f WA AUS', 'Grpn'],
    ['WWW.QUORVENTA.AI EXAMPLEVILLE USA', 'Quorventa Exampleville'],
    ['CRED VOUCHER Coles Online Pellacombe AUS', 'Coles'],
    ['CARD FEE', 'Account fee'],
  ])('%s → %s', (raw, name) => {
    expect(cleanMerchant(raw).name).toBe(name)
  })
})

describe('card codes', () => {
  it('drops "V7302"-style card codes and recognises a well-known service however it is written', () => {
    expect(cleanMerchant('V7302 04/11 DROPBOX DROPBOX.COM IRL').name).toBe('Dropbox')
    expect(cleanMerchant('V7302 DROPBOX DROPBOX').key).toBe(cleanMerchant('DROPBOX IRL').key)
    expect(cleanMerchant('V5518 SOME LOCAL SHOP ORRINDALE').name).not.toMatch(/V5518/)
  })
})

describe('placeOf', () => {
  it.each([
    ['GLOAMWICK NSW NSW AU', 'NSW'],
    ['THE FERN ROOM NORTH QLD', 'North QLD'],
    ['BURGER LOFT SOUTH TAS', 'South TAS'],
    ['CAFE VERDELLO PTY LTD VIC', 'VIC'],
  ])('finds the town in %s', (raw, place) => {
    expect(placeOf(raw)).toBe(place)
  })

  it.each([['ZENTROVA CASTELVARRO ITA'], ['ACME PTY LTD'], ['WOOLWORTHS 3318 QUILLMERE'], ['PAT SAMPLE Alex lunch']])('finds nothing extra in %s', (raw) => {
    expect(placeOf(raw)).toBeUndefined()
  })
})

describe('merchantTextForAi drops company wording', () => {
  it.each([
    ['Kestrelvane Brothers Pty L Orrindale', 'Kestrelvane Brothers Orrindale'],
    ['Pollo Varnholt Pty Lt Varnholt', 'Pollo Varnholt Varnholt'],
    ['Acme Widgets Pty Ltd', 'Acme Widgets'],
    ['Sample & Co P/L Quillmere', 'Sample & Co Quillmere'],
  ])('%s → %s', (name, text) => {
    expect(merchantTextForAi(name)).toBe(text)
  })
  it("keeps words that only look like company wording inside a shop's name", () => {
    expect(merchantTextForAi('Co Op Hardware')).toBe('Co Op Hardware')
  })
})

describe('card purchases with the time stuck to the shop', () => {
  it.each([
    ['EFTPOS 14/03 19:52NETFLIX.COM AU REF-00004417', 'Netflix'],
    ['EFTPOS 22/06 08:14NETFLIX.COM AU REF-00009153', 'Netflix'],
    ['EFTPOS 03/07 16:41EXAMPLE LEDGER', 'Example Ledger'],
    ['POS 05/07 Google Workspace_sampleuser Pellacombe', 'Google Workspace'],
  ])('%s → %s', (raw, name) => {
    expect(cleanMerchant(raw).name).toBe(name)
  })
})

describe('well-known shops glued to numbers', () => {
  it.each([
    ['VISA DEBIT 21:47NETFLIX.COM QUILLMERE', 'Netflix'],
    ['CARD 9021 07:33SPOTIFY X9Q4W2', 'Spotify'],
    ['TXN 5216DISNEY PLUS AU REF-00004417', 'Disney+'],
  ])('%s → %s', (raw, name) => {
    expect(cleanMerchant(raw).name).toBe(name)
  })
})

describe('stray punctuation around words', () => {
  it.each([
    ['-PLUMWISE- ORRINDALE AUS', 'Plumwise Orrindale'],
    ['TRANSITCARD TOPUP TRANSITCARD.EXAMPLE/ USA', 'Transitcard Topup Transitcard.Example'],
    ['TUI BOOKS EXAMPLETON 03- CAN', 'Tui Books Exampleton'],
  ])('%s → %s', (raw, name) => {
    expect(cleanMerchant(raw).name).toBe(name)
  })
})
