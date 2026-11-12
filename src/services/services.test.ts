import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { needsReview } from '../core/categorise'
import { fallbackClassifier } from '../core/fallbackClassifier'
import { findFraudFlags } from '../core/fraud'
import { findSavings } from '../core/savings'
import { detectSubscriptions } from '../core/subscriptions'
import { db, setMeta, useDatabase } from '../db/db'
import { changeCategory, deleteAllData, exportBackup, deleteView, forgetBrowserStorage, importsNewestFirst, loadSampleData, markFraud, removeImport, renameByKeyword, renameMerchant, restoreBackup, saveView } from './actions'
import { clearApiKey, setApiKey } from './apiKey'
import { chosenClassifier, createAiClassifier, getSmartSorting, setSmartSorting } from './classifier'
import { commitStatement, defaultAccountChoice, suggestAccount, updateStarterCategories } from './importer'

let n = 0
beforeEach(async () => {
  useDatabase(`test-${++n}`)
  await db.open()
})

describe('example data end to end', () => {
  it('imports, categorises and produces every kind of insight', async () => {
    await loadSampleData()
    const txs = await db.transactions.toArray()
    const cats = await db.categories.toArray()
    expect(txs.length).toBeGreaterThan(400)
    // Card repayments are recognised on both sides
    expect(txs.filter((t) => t.isTransfer).length).toBeGreaterThanOrEqual(20)
    expect(txs.filter((t) => t.categoryId === 'uncategorised' && t.amount < 0 && !t.isTransfer).map((t) => t.merchant)).toEqual(['Qzt Digital Svc'])

    const subs = detectSubscriptions(txs)
    const names = subs.filter((s) => s.active).map((s) => s.merchant)
    for (const expected of ['Netflix', 'Disney+', 'Spotify', 'Amazon Prime', 'Skylark Mobile Pellacombe', 'Ironfern Gym Orrindale']) expect(names).toContain(expected)

    const kinds = findSavings(txs, subs, cats).map((s) => s.kind)
    for (const k of ['foreign-fees', 'overlapping-subscriptions', 'price-rise', 'spending-creep'] as const) expect(kinds).toContain(k)

    const insights = new Map((await db.insights.toArray()).map((i) => [i.merchantKey, i]))
    const flags = findFraudFlags(txs, insights, new Map())
    const flagged = flags.map((f) => txs.find((t) => t.id === f.transactionId)!.merchant)
    expect(flagged).toContain('Qzt Digital Svc')
    expect(flagged).toContain('The Gilded Heron Tavern Quillmere')
  })
})

describe('corrections', () => {
  const statement = {
    readerId: 'test',
    bank: 'Test',
    accountLabel: 'Card',
    warnings: [],
    transactions: [
      { date: '2026-06-03', rawDescription: 'MYSTERY CAFE AUS', amount: -4.6 },
      { date: '2026-06-04', rawDescription: 'MYSTERY CAFE AUS', amount: -5.8 },
    ],
  }

  it('applies "all from this merchant" to past and future transactions and logs it', async () => {
    await commitStatement(statement, 'a.csv', fallbackClassifier)
    const [first] = await db.transactions.orderBy('date').toArray()
    expect(needsReview(first)).toBe(true)
    await changeCategory(first.id, 'dining', 'merchant')
    expect((await db.transactions.toArray()).every((t) => t.categoryId === 'dining')).toBe(true)
    // A later import from the same merchant follows the rule
    await commitStatement({ ...statement, transactions: [{ date: '2026-06-12', rawDescription: 'MYSTERY CAFE AUS', amount: -10.4 }] }, 'b.csv', fallbackClassifier)
    expect((await db.transactions.toArray()).map((t) => t.categoryId)).toEqual(['dining', 'dining', 'dining'])
    const [log] = await db.corrections.toArray()
    expect(log).toMatchObject({ aiCategoryId: 'cafes', userCategoryId: 'dining', scope: 'merchant', aiSource: 'fallback' })
  })

  it('changes just one transaction when asked', async () => {
    await commitStatement(statement, 'a.csv', fallbackClassifier)
    const [first] = await db.transactions.orderBy('date').toArray()
    await changeCategory(first.id, 'gifts', 'one')
    const cats = (await db.transactions.orderBy('date').toArray()).map((t) => t.categoryId)
    expect(cats).toEqual(['gifts', 'cafes'])
  })

  it('skips rows from an overlapping statement', async () => {
    await commitStatement(statement, 'a.csv', fallbackClassifier)
    const second = await commitStatement(statement, 'a-again.csv', fallbackClassifier)
    expect(second).toMatchObject({ added: 0, duplicates: 2 })
  })
})

describe('trust features', () => {
  it('backs up, deletes and restores', async () => {
    await loadSampleData()
    const count = await db.transactions.count()
    const t = (await db.transactions.toArray())[0]
    await markFraud(t.id, 'legit')
    const blob = await exportBackup()
    await deleteAllData()
    expect(await db.transactions.count()).toBe(0)
    expect(await db.categories.count()).toBeGreaterThan(10)
    await restoreBackup(new File([await blob.text()], 'backup.json'))
    expect(await db.transactions.count()).toBe(count)
    expect(await db.fraudDecisions.get(`merchant:${t.merchantKey}`)).toBeTruthy()
  })
})

describe('multiple and overlapping statements', () => {
  const day = (m: number, d: number) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // One purchase on the 3rd and 17th of every month from March to September
  const all = [3, 4, 5, 6, 7, 8, 9].flatMap((m) => [
    { date: day(m, 3), rawDescription: 'Coles Online Pellacombe AUS', amount: -71 - m },
    { date: day(m, 17), rawDescription: 'UBER *EATS HELP.UBER.COM AUS', amount: -26 - m },
  ])
  const card = (from: number, to: number, extra = {}) => ({
    readerId: 'westpac-pdf',
    bank: 'Westpac',
    accountLabel: 'Example Card',
    accountSuffix: '2846',
    warnings: [],
    transactions: all.filter((t) => +t.date.slice(5, 7) >= from && +t.date.slice(5, 7) <= to),
    ...extra,
  })

  it('March–May then March–September counts March–May only once', async () => {
    const first = await commitStatement(card(3, 5), 'mar-may.pdf', fallbackClassifier)
    const second = await commitStatement(card(3, 9), 'mar-sep.pdf', fallbackClassifier)
    expect(first).toMatchObject({ added: 6, duplicates: 0 })
    expect(second).toMatchObject({ added: 8, duplicates: 6 })
    expect(await db.transactions.count()).toBe(14)
  })

  it('recognises the same account from a CSV download with different wording', async () => {
    await commitStatement(card(3, 5), 'mar-may.pdf', fallbackClassifier)
    const csv = {
      readerId: 'westpac-csv',
      bank: 'Westpac',
      accountLabel: 'Westpac account',
      warnings: [],
      transactions: card(3, 6).transactions.map((t) => ({ ...t, rawDescription: t.rawDescription.toUpperCase().replace(/ AUS$/, '') })),
    }
    const accountId = suggestAccount(csv, await db.accounts.toArray())
    expect(accountId).toBeUndefined() // different name and no card digits: the user picks it in the preview
    const [existing] = await db.accounts.toArray()
    const res = await commitStatement(csv, 'export.csv', fallbackClassifier, { accountId: existing.id })
    expect(res).toMatchObject({ added: 2, duplicates: 6 })
    expect(await db.accounts.count()).toBe(1)
  })

  it('keeps different cards separate', async () => {
    await commitStatement(card(3, 5), 'a.pdf', fallbackClassifier)
    await commitStatement({ ...card(3, 5), bank: 'CommBank', accountLabel: 'Everyday', accountSuffix: '6083' }, 'b.csv', fallbackClassifier)
    expect(await db.accounts.count()).toBe(2)
    expect(await db.transactions.count()).toBe(12)
  })

  it('suggests the matching account by bank and card digits', async () => {
    await commitStatement(card(3, 5), 'a.pdf', fallbackClassifier)
    const [acc] = await db.accounts.toArray()
    expect(suggestAccount({ ...card(6, 9), accountLabel: 'Renamed card' }, [acc])).toBe(acc.id)
  })
})

describe('renaming shops', () => {
  it('renames past transactions and applies the name to future imports', async () => {
    const st = (date: string) => ({ readerId: 't', bank: 'B', accountLabel: 'A', warnings: [], transactions: [{ date, rawDescription: 'PAYPAL *GLOAMWICKHALL 5550001234 AUS', amount: -22 }] })
    await commitStatement(st('2026-01-01'), 'a', fallbackClassifier)
    const [t] = await db.transactions.toArray()
    await renameMerchant(t.merchantKey, 'Gloamwick Hall')
    await commitStatement(st('2026-02-01'), 'b', fallbackClassifier)
    expect((await db.transactions.toArray()).map((x) => x.merchant)).toEqual(['Gloamwick Hall', 'Gloamwick Hall'])
  })
})

describe('renaming keeps the category', () => {
  it("doesn't ask the engine again or move the shop to another category", async () => {
    const st = { readerId: 't', bank: 'B', accountLabel: 'A', warnings: [], transactions: [{ date: '2026-01-01', rawDescription: 'EFTPOS 14/03 19:52ZENTROVA AU REF-00004417', amount: -27 }] }
    await commitStatement(st, 'a', fallbackClassifier)
    const [t] = await db.transactions.toArray()
    await db.insights.put({ merchantKey: t.merchantKey, categoryId: 'software', confidence: 0.7, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai', at: '2026-01-01T00:00:00Z' })
    const { refreshCategories } = await import('./importer')
    await refreshCategories()
    const before = (await db.transactions.get(t.id))!.categoryId
    await renameMerchant(t.merchantKey, 'Zentrova cloud')
    expect((await db.insights.get(t.merchantKey))?.categoryId).toBe('software')
    expect((await db.transactions.get(t.id))!.categoryId).toBe(before)
  })
})

describe('two accounts with the same name', () => {
  it('does not suggest a different account just because the name matches', async () => {
    const st = (suffix: string) => ({ readerId: 'westpac-pdf', bank: 'Westpac', accountLabel: 'Everyday', accountSuffix: suffix, warnings: [], transactions: [] })
    await commitStatement(st('6083'), 'a.pdf', fallbackClassifier)
    const accounts = await db.accounts.toArray()
    expect(suggestAccount(st('4321'), accounts)).toBeUndefined()
    expect(suggestAccount(st('6083'), accounts)).toBe(accounts[0].id)
  })
})

describe('re-cleaning shop names', () => {
  it('merges old shop names into the improved one and keeps the user’s choices', async () => {
    const { recleanMerchants } = await import('./importer')
    const { makeTx } = await import('../core/testing')
    const { detectSubscriptions } = await import('../core/subscriptions')
    const { SUBSCRIPTION_MERCHANTS } = await import('../core/merchants')
    // Stored before card codes were stripped: each row kept "V7302" in its shop name
    const old = ['2026-04-04', '2026-05-04', '2026-06-04'].map((d) =>
      makeTx(d, -15, 'V7302 04/11 DROPBOX DROPBOX.COM IRL', { merchant: 'V7302 Dropbox Dropbox', merchantKey: 'v7302-dropbox-dropbox', categoryId: 'groceries', categorySource: 'ai', confidence: 0.7 }),
    )
    await db.transactions.bulkAdd(old)
    await db.merchantNames.put({ merchantKey: 'v7302-dropbox-dropbox', name: 'Dropbox storage', at: '2026-06-10' })

    expect(await recleanMerchants()).toBe(3)
    const after = await db.transactions.toArray()
    expect(new Set(after.map((t) => t.merchantKey))).toEqual(new Set(['dropbox']))
    expect(after.every((t) => t.merchant === 'Dropbox storage')).toBe(true)
    expect(after.every((t) => t.categoryId === 'software')).toBe(true)
    expect(detectSubscriptions(after, new Set(SUBSCRIPTION_MERCHANTS)).map((s) => s.merchantKey)).toContain('dropbox')
    // Only once
    expect(await recleanMerchants()).toBe(0)
  })
})

describe('re-checking shops the AI was unsure about', () => {
  it('replaces unsure answers with fresh AI ones, but never with offline guesses', async () => {
    const { recheckUnsureShops, refreshCategories } = await import('./importer')
    const { makeTx } = await import('../core/testing')
    const outfitter = makeTx('2026-06-01', -164, 'TALLOWMERE OUTFITTERS NSW AUS')
    const cafe = makeTx('2026-06-02', -9.5, 'BRAMBLECUP CAFE ORRINDALE AUS')
    await db.transactions.bulkAdd([outfitter, cafe])
    const at = '2026-06-01T00:00:00Z'
    await db.insights.bulkPut([
      { merchantKey: outfitter.merchantKey, categoryId: 'dining', confidence: 0.62, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai', at },
      { merchantKey: cafe.merchantKey, categoryId: 'cafes', confidence: 0.95, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai', at },
    ])
    await refreshCategories()
    const asked: string[] = []
    const answer = (source: 'ai' | 'fallback') => ({
      name: source,
      async classify(items: Array<{ merchantKey: string; text: string }>) {
        asked.push(...items.map((i) => i.text))
        return items.map((i) => ({ merchantKey: i.merchantKey, categoryId: source === 'ai' ? 'clothing' : 'uncategorised', confidence: 0.9, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source }))
      },
    })

    expect(await recheckUnsureShops(answer('fallback'))).toEqual({ checked: 0, changed: 0 })
    expect((await db.transactions.get(outfitter.id))!.categoryId).toBe('dining')

    expect(await recheckUnsureShops(answer('ai'))).toEqual({ checked: 1, changed: 1 })
    expect((await db.transactions.get(outfitter.id))!.categoryId).toBe('clothing')
    // The confident answer was never re-asked
    expect([...new Set(asked)]).toEqual([outfitter.merchant])
  })
})

describe('uploaded files list', () => {
  it('lists uploaded statements newest first', async () => {
    await loadSampleData()
    const imports = await importsNewestFirst()
    expect(imports.length).toBeGreaterThan(1)
    const times = imports.map((i) => i.at)
    expect(times).toEqual([...times].sort().reverse())
  })
})

describe('removing one statement', () => {
  it("deletes only that file's transactions and keeps the user's corrections", async () => {
    await loadSampleData()
    const [removed, kept] = await db.imports.toArray()
    const keep = await db.transactions.where('importId').equals(kept.id).toArray()
    const shop = keep.find((t) => t.amount < 0 && !t.isTransfer)!
    await changeCategory(shop.id, 'gifts', 'merchant')

    await removeImport(removed.id)

    expect(await db.transactions.where('importId').equals(removed.id).count()).toBe(0)
    expect(await db.transactions.where('importId').equals(kept.id).count()).toBe(keep.length)
    expect(await db.imports.get(removed.id)).toBeUndefined()
    expect(await db.rules.get(shop.merchantKey)).toBeDefined()
    expect(await db.corrections.count()).toBe(1)
    // The account had nothing else in it, so it goes too
    expect(await db.accounts.get(removed.accountId)).toBeUndefined()
    expect(await db.accounts.get(kept.accountId)).toBeDefined()
  })

  it('keeps the account while another of its statements remains', async () => {
    await loadSampleData()
    const [first] = await db.imports.toArray()
    await db.imports.put({ ...first, id: 'second', fileName: 'later.csv' })
    await db.transactions.where('importId').equals(first.id).limit(5).modify({ importId: 'second' })

    await removeImport(first.id)

    expect(await db.accounts.get(first.accountId)).toBeDefined()
    expect(await db.transactions.where('importId').equals('second').count()).toBe(5)
  })
})

describe('starter categories update', () => {
  it('adds the Business group, moves software and professional services into it, and keeps your own choices', async () => {
    // Someone set up before the Business group existed, who had moved Professional Services themselves
    await db.groups.delete('business')
    await db.categories.bulkDelete(['office', 'marketing', 'business-travel'])
    await db.categories.update('software', { groupId: 'lifestyle' })
    await db.categories.update('professional', { groupId: 'home' })
    await setMeta('starterVersion', 2)

    await updateStarterCategories()

    expect((await db.groups.get('business'))?.name).toBe('Business')
    expect((await db.categories.get('software'))?.groupId).toBe('business')
    expect((await db.categories.get('professional'))?.groupId).toBe('home')
    for (const id of ['office', 'marketing', 'business-travel']) expect((await db.categories.get(id))?.groupId).toBe('business')
  })
})

describe('saved views', () => {
  it('saves a named view of a page and deletes it again', async () => {
    const hidden = Array.from({ length: 40 }, (_, i) => `m:some-long-shop-name-${i}`)
    const view = await saveView('dashboard', '  Base spending ', { period: { kind: 'last', months: 6 }, hidden })
    const [stored] = await db.views.toArray()
    expect(stored.name).toBe('Base spending')
    expect(stored.page).toBe('dashboard')
    expect(JSON.parse(stored.state).hidden).toEqual(hidden)
    await deleteView(view.id)
    expect(await db.views.count()).toBe(0)
  })

  it('replaces a view saved again under the same name', async () => {
    await saveView('transactions', 'Groceries', { search: 'a' })
    await saveView('transactions', 'groceries', { search: 'b' })
    const all = await db.views.toArray()
    expect(all).toHaveLength(1)
    expect(JSON.parse(all[0].state).search).toBe('b')
  })
})

describe('re-checking unsure shops after each upload', () => {
  it('asks again about shops the engine was unsure of a week or more ago, but not fresh ones', async () => {
    const { makeTx } = await import('../core/testing')
    const old = makeTx('2026-06-01', -36, 'TIDEMARK BARBERS ORRINDALE AUS')
    const fresh = makeTx('2026-06-02', -41, 'GLOAMWICK NSW NSW AUS')
    await db.transactions.bulkAdd([old, fresh])
    await db.insights.bulkPut([
      { merchantKey: old.merchantKey, categoryId: 'uncategorised', confidence: 0.25, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai', at: '2020-01-01T00:00:00Z' },
      { merchantKey: fresh.merchantKey, categoryId: 'insurance', confidence: 0.22, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai', at: new Date().toISOString() },
    ])
    const asked: string[] = []
    const engine = {
      name: 'ai' as const,
      async classify(items: Array<{ merchantKey: string; text: string }>) {
        asked.push(...items.map((i) => i.text))
        return items.map((i) => ({ merchantKey: i.merchantKey, categoryId: 'personal-care', confidence: 1, subscriptionLikelihood: 0, suspiciousLikelihood: 0, source: 'ai' as const }))
      },
    }
    const statement = { readerId: 'test', bank: 'Westpac', accountLabel: 'Card', transactions: [{ date: '2026-06-05', rawDescription: 'COLES 0719 VARNHOLT', amount: -12.3 }], warnings: [] }
    await commitStatement(statement, 'card.pdf', engine, { label: 'Card' })
    expect(asked).toContain('Tidemark Barbers Orrindale')
    expect(asked).not.toContain('Gloamwick')
    expect((await db.transactions.get(old.id))!.categoryId).toBe('personal-care')
  })
})

describe('Business group colour', () => {
  it('moves to the clearer teal unless the user picked their own colour', async () => {
    await db.groups.update('business', { color: '#0e7c86' })
    await setMeta('starterVersion', 3)
    await updateStarterCategories()
    expect((await db.groups.get('business'))!.color).toBe('#0097a7')

    await db.groups.update('business', { color: '#123456' })
    await setMeta('starterVersion', 3)
    await updateStarterCategories()
    expect((await db.groups.get('business'))!.color).toBe('#123456')
  })
})

describe('rename by key word', () => {
  const st = (rows: Array<{ date: string; rawDescription: string; amount: number }>) => ({ readerId: 't', bank: 'Example Bank', accountLabel: 'Second card', warnings: [], transactions: rows })

  it('merges every shop whose wording has the key word, keeps your category, and applies to future uploads', async () => {
    await commitStatement(
      st([
        { date: '2026-03-09', rawDescription: 'SQ *ODDSOFT NSW', amount: -44 },
        { date: '2026-04-11', rawDescription: 'ODDSOFT BILLING 11122', amount: -47 },
        { date: '2026-04-12', rawDescription: 'COLES 0719 VARNHOLT', amount: -18 },
      ]),
      'a',
      fallbackClassifier,
      { label: 'Second card' },
    )
    const before = await db.transactions.toArray()
    expect(new Set(before.filter((t) => /ODDSOFT/.test(t.rawDescription)).map((t) => t.merchantKey)).size).toBe(2)
    const first = before.find((t) => t.rawDescription.startsWith('SQ'))!
    await changeCategory(first.id, 'software', 'merchant')

    expect(await renameByKeyword('oddsoft', 'OddSoft')).toBe(2)
    const odd = (await db.transactions.toArray()).filter((t) => /ODDSOFT/.test(t.rawDescription))
    expect(odd.map((t) => [t.merchant, t.merchantKey, t.categoryId])).toEqual([
      ['OddSoft', 'oddsoft', 'software'],
      ['OddSoft', 'oddsoft', 'software'],
    ])
    expect((await db.transactions.toArray()).find((t) => t.rawDescription.startsWith('COLES'))!.merchant).toBe('Coles')

    await commitStatement(st([{ date: '2026-05-11', rawDescription: 'ODDSOFT PTY LTD 731', amount: -49 }]), 'b', fallbackClassifier, { accountId: first.accountId })
    const later = (await db.transactions.toArray()).find((t) => t.date === '2026-05-11')!
    expect([later.merchant, later.categoryId]).toEqual(['OddSoft', 'software'])
  })

  it('still spots duplicates and survives a re-tidy of shop names', async () => {
    const rows = [{ date: '2026-03-09', rawDescription: 'ODDSOFT BILLING 11122', amount: -44 }]
    await commitStatement(st(rows), 'a', fallbackClassifier, { label: 'Second card' })
    await renameByKeyword('ODDSOFT', 'OddSoft')
    const [acc] = await db.accounts.toArray()
    const again = await commitStatement(st(rows), 'b', fallbackClassifier, { accountId: acc.id })
    expect(again.duplicates).toBe(1)

    const { recleanMerchants } = await import('./importer')
    await setMeta('cleanVersion', 1)
    await recleanMerchants()
    expect((await db.transactions.toArray()).map((t) => t.merchant)).toEqual(['OddSoft'])
  })
})

describe('smart sorting', () => {
  const failingFetch = (async () => {
    throw new Error('nothing may be sent while smart sorting is off')
  }) as unknown as typeof fetch

  it('is off until the user says yes: imports are sorted on this device and nothing is sent', async () => {
    expect(await getSmartSorting()).toBe('ask')
    const sent: string[] = []
    const spy = (async (_url: string, init: RequestInit) => {
      sent.push(String(init.body))
      return new Response('{}', { status: 503 })
    }) as unknown as typeof fetch
    const classifier = await chosenClassifier(undefined, spy)
    expect(classifier.name).toBe('fallback')
    await commitStatement(
      { readerId: 'test', bank: 'Test', accountLabel: 'Card', transactions: [{ date: '2026-06-01', rawDescription: 'QUILLHAVEN TRADING CO NSW', amount: -38 }], warnings: [] },
      'a.csv',
      classifier,
    )
    expect(sent).toEqual([])
    expect((await db.insights.toArray()).every((i) => i.source === 'fallback')).toBe(true)
  })

  it('uses the AI only when switched on AND the user has given a key, and stays off after "no thanks"', async () => {
    const restore = withFakeBrowserStorage()
    try {
      await setSmartSorting('off')
      setApiKey(TEST_KEY, false)
      expect((await chosenClassifier(undefined, failingFetch)).name).toBe('fallback')
      await setSmartSorting('on')
      expect((await chosenClassifier(undefined, failingFetch)).name).toBe('ai')
      clearApiKey()
      expect((await chosenClassifier(undefined, failingFetch)).name).toBe('fallback')
    } finally {
      restore()
    }
  })

  it('sends only shop names to openrouter.ai, and never amounts, dates or the bank wording', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = []
    const spy = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: new Headers(init.headers).get('Authorization') ?? '' })
      return Response.json({ answers: { category: { choice: 'dining', confidence: 0.9 }, subscription: { noul: 0.1 }, suspicious: { noul: 0.05 } } })
    }) as unknown as typeof fetch
    await commitStatement(
      {
        readerId: 'test',
        bank: 'Test',
        accountLabel: 'Card',
        accountSuffix: '8264',
        transactions: [{ date: '2026-06-01', rawDescription: 'QUILLHAVEN TRADING CO 39517 NSW AUS', amount: -38.64 }],
        warnings: [],
      },
      'statement-file-name.csv',
      createAiClassifier(TEST_KEY, undefined, spy),
    )
    expect(calls.length).toBe(1)
    expect(new URL(calls[0].url).origin).toBe('https://openrouter.ai')
    expect(calls[0].auth).toBe(`Bearer ${TEST_KEY}`)
    for (const secret of ['38.64', '2026-06-01', '39517', '8264', 'statement-file-name', 'TRADING CO 39517']) expect(calls[0].body).not.toContain(secret)
    expect(calls[0].body).toContain('Quillhaven Trading')
    expect((await db.insights.toArray())[0]).toMatchObject({ source: 'ai', categoryId: 'dining' })
  })

  it('keeps the on-device guess when OpenRouter refuses the key, and stops asking', async () => {
    let n = 0
    const refuse = (async () => {
      n++
      return new Response('{"error":"bad key"}', { status: 401 })
    }) as unknown as typeof fetch
    const items = Array.from({ length: 20 }, (_, i) => ({ merchantKey: `shop-${i}`, text: `Example Shop ${String.fromCharCode(65 + i)}` }))
    let status = ''
    const out = await createAiClassifier(TEST_KEY, (s) => (status = s), refuse).classify(items, await db.categories.toArray())
    expect(out).toHaveLength(20)
    expect(out.every((r) => r.source !== 'ai')).toBe(true)
    expect(status).toBe('offline')
    // Each of the 4 parallel workers makes at most one request before they all give up
    expect(n).toBeLessThanOrEqual(4)
  })

  it('never puts the key in a backup file', async () => {
    const restore = withFakeBrowserStorage()
    try {
      setApiKey(TEST_KEY, true)
      const backup = await (await exportBackup()).text()
      expect(backup).not.toContain(TEST_KEY)
      expect(backup).not.toContain('sk-or-')
    } finally {
      restore()
    }
  })
})

/** A made-up key in OpenRouter's format; it is never sent anywhere (every test fetch is a stub) */
const TEST_KEY = 'sk-or-v1-0000000000000000000000000000000000000000'

/** Node has no window.sessionStorage/localStorage; give the key store a stand-in for one test */
function withFakeBrowserStorage(): () => void {
  const fake = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      get length() {
        return m.size
      },
      key: (i: number) => [...m.keys()][i] ?? null,
    }
  }
  const g = globalThis as { window?: unknown }
  const before = g.window
  g.window = { sessionStorage: fake(), localStorage: fake() }
  return () => {
    g.window = before
  }
}

describe('restoring a backup', () => {
  const backupWith = async (edit: (tables: Record<string, Array<Record<string, unknown>>>) => void) => {
    const payload = JSON.parse(await (await exportBackup()).text())
    edit(payload.tables)
    return new File([JSON.stringify(payload)], 'backup.json')
  }

  it('never switches smart sorting on, even when the backup says it was on', async () => {
    await loadSampleData()
    const file = await backupWith((t) => t.meta.push({ key: 'smartSorting', value: 'on' }))
    await setSmartSorting('off')
    await restoreBackup(file)
    expect(await getSmartSorting()).toBe('off')
    await deleteAllData()
    await restoreBackup(file)
    expect(await getSmartSorting()).toBe('ask')
  })

  it('refuses a file with an entry in the wrong shape, and keeps the current data', async () => {
    await loadSampleData()
    const count = await db.transactions.count()
    const bad = await backupWith((t) => (t.transactions[0].amount = '=1+1'))
    await expect(restoreBackup(bad)).rejects.toThrow(/expected shape/)
    expect(await db.transactions.count()).toBe(count)
    const badColour = await backupWith((t) => (t.groups[0].color = 'red; background: url(x)'))
    await expect(restoreBackup(badColour)).rejects.toThrow(/expected shape/)
  })
})

describe('a second file in the same batch', () => {
  const statement = (label: string, from: string, to: string) => ({
    readerId: 'csv-saved',
    bank: 'Unknown bank',
    accountLabel: label,
    warnings: [],
    transactions: [
      { date: from, rawDescription: 'SHOP ONE', amount: -5 },
      { date: to, rawDescription: 'SHOP TWO', amount: -6 },
    ],
  })

  it('defaults to a new account named after its own file when the dates overlap', async () => {
    const first = await commitStatement(statement('sample-everyday-account', '2025-08-16', '2026-08-10'), 'sample-everyday-account.csv', fallbackClassifier)
    const batch = [{ id: first.accountId, bank: 'Unknown bank', label: 'sample-everyday-account', from: '2025-08-16', to: '2026-08-10' }]
    const second = statement('sample-everyday-account', '2025-08-18', '2026-08-13')
    expect(defaultAccountChoice(second, 'sample-credit-card.csv', await db.accounts.toArray(), batch)).toEqual({ accountId: undefined, name: 'sample-credit-card' })
    // Even before the new account shows up in the list
    expect(defaultAccountChoice(second, 'sample-credit-card.csv', [], batch)).toEqual({ accountId: undefined, name: 'sample-credit-card' })
  })

  it('still joins the same account when the files are consecutive months', async () => {
    const first = await commitStatement(statement('Everyday', '2026-01-01', '2026-01-31'), 'jan.csv', fallbackClassifier)
    const batch = [{ id: first.accountId, bank: 'Unknown bank', label: 'Everyday', from: '2026-01-01', to: '2026-01-31' }]
    expect(defaultAccountChoice(statement('Everyday', '2026-02-01', '2026-02-28'), 'feb.csv', await db.accounts.toArray(), batch)).toEqual({ accountId: first.accountId, name: 'Everyday' })
  })

  it('uses the usual match for a file from an earlier upload', async () => {
    const first = await commitStatement(statement('Everyday', '2026-01-01', '2026-01-31'), 'jan.csv', fallbackClassifier)
    expect(defaultAccountChoice(statement('Everyday', '2026-01-01', '2026-01-31'), 'jan-again.csv', await db.accounts.toArray(), [])).toEqual({ accountId: first.accountId, name: 'Everyday' })
  })
})

describe('forgetting browser storage', () => {
  it('clears page preferences such as the last search, and the key, but nothing belonging to other sites', () => {
    const restore = withFakeBrowserStorage()
    try {
      const w = (globalThis as unknown as { window: { localStorage: Storage; sessionStorage: Storage } }).window
      w.localStorage.setItem('local-ledger.transactions.search', '"rent"')
      w.localStorage.setItem('local-ledger.dashboard.hidden', '[]')
      w.localStorage.setItem('someone-else', 'keep')
      setApiKey(TEST_KEY, true)
      forgetBrowserStorage()
      expect(w.localStorage.getItem('local-ledger.transactions.search')).toBeNull()
      expect(w.localStorage.getItem('local-ledger.dashboard.hidden')).toBeNull()
      expect(w.localStorage.getItem('someone-else')).toBe('keep')
      expect(w.localStorage.length).toBe(1)
      expect(w.sessionStorage.length).toBe(0)
    } finally {
      restore()
    }
  })
})
