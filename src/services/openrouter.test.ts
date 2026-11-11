import { describe, expect, it } from 'vitest'
import { looksLikeOpenRouterKey } from './apiKey'
import { buildJevRequest, checkKey, createJevClient, isSafeToSend, OpenRouterError, parseJevResponse } from './openrouter'

const cats = [
  { id: 'clothing', name: 'Clothing', hint: 'Clothes, shoes, suits' },
  { id: 'dining', name: 'Dining out', hint: 'Restaurants, cafes, pubs' },
]
const KEY = 'sk-or-v1-0000000000000000000000000000000000000000'
const answer = { answers: { category: { choice: 'clothing', confidence: 0.82 }, subscription: { noul: 0.05 }, suspicious: { noul: 0.02 } } }

describe('what may be sent', () => {
  it.each([
    [{ text: 'Pellacombe Tailors' }, true],
    [{ text: 'Pellacombe Tailors', place: 'QLD' }, true],
    [{ text: 'Pellacombe Tailors', place: 'North NSW' }, true],
    [{ text: 'Pay 1112222' }, false], // a run of digits could be an account or reference number
    [{ text: 'Pellacombe Tailors', place: 'NSW 2999' }, false], // a postcode is more than a town
    [{ text: '' }, false],
    [{ text: 'x'.repeat(61) }, false],
  ])('%o → %s', (shop, ok) => {
    expect(isSafeToSend(shop)).toBe(ok)
  })

  it('refuses unsafe text without making a request', async () => {
    let calls = 0
    const jev = createJevClient({ apiKey: KEY, fetchImpl: (async () => (calls++, Response.json(answer))) as unknown as typeof fetch })
    expect(await jev.classify({ text: 'Transfer 11112222' }, cats)).toBeUndefined()
    expect(calls).toBe(0)
  })
})

describe('the Jev request', () => {
  it('holds only the shop, the town and the category list', () => {
    const req = buildJevRequest('typesafe/jev-1.13', { text: 'Pellacombe Tailors', place: 'QLD' }, cats)
    expect(req.model).toBe('typesafe/jev-1.13')
    expect(req.state).toContain('"Pellacombe Tailors"')
    expect(req.state).toContain('QLD')
    expect(req.questions.category.criteria).toEqual({ clothing: 'Clothing: Clothes, shoes, suits', dining: 'Dining out: Restaurants, cafes, pubs' })
    expect(Object.keys(req.questions)).toEqual(['category', 'subscription', 'suspicious'])
  })
})

describe('reading the answer', () => {
  it('takes the chosen category and clamps the likelihoods', () => {
    expect(parseJevResponse({ answers: { category: { choice: 'dining', confidence: 1.4 }, subscription: { noul: -1 }, suspicious: { noul: 0.3 } } }, new Set(['dining']))).toEqual({
      categoryId: 'dining',
      confidence: 1,
      subscriptionLikelihood: 0,
      suspiciousLikelihood: 0.3,
    })
  })
  it('falls back to the probability of the choice when there is no confidence', () => {
    expect(parseJevResponse({ answers: { category: { choice: 'dining', probabilities: { dining: 0.64 } } } }, new Set(['dining']))?.confidence).toBe(0.64)
  })
  it('ignores a category the user does not have', () => {
    expect(parseJevResponse({ answers: { category: { choice: 'made-up', confidence: 0.9 } } }, new Set(['dining']))).toBeUndefined()
  })
})

describe('the OpenRouter client', () => {
  it('signs with the key, sends no cookies or referrer, and only talks to openrouter.ai', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const jev = createJevClient({ apiKey: KEY, fetchImpl: (async (url: string, init: RequestInit) => (seen.push({ url, init }), Response.json(answer))) as unknown as typeof fetch })
    expect(await jev.classify({ text: 'Pellacombe Tailors' }, cats)).toEqual({ categoryId: 'clothing', confidence: 0.82, subscriptionLikelihood: 0.05, suspiciousLikelihood: 0.02 })
    expect(new URL(seen[0].url).origin).toBe('https://openrouter.ai')
    const headers = new Headers(seen[0].init.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${KEY}`)
    expect(headers.has('HTTP-Referer')).toBe(false)
    expect(seen[0].init.credentials).toBe('omit')
    expect(seen[0].init.referrerPolicy).toBe('no-referrer')
  })

  it('tries the second Decisions path when the first is not found, then remembers it', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(url)
      return url.includes('/api/v1/') ? new Response('', { status: 404 }) : Response.json(answer)
    }) as unknown as typeof fetch
    const jev = createJevClient({ apiKey: KEY, fetchImpl })
    await jev.classify({ text: 'Pellacombe Tailors' }, cats)
    await jev.classify({ text: 'Verdello Bistro' }, cats)
    expect(urls).toEqual(['https://openrouter.ai/api/v1/alpha/decisions', 'https://openrouter.ai/api/alpha/decisions', 'https://openrouter.ai/api/alpha/decisions'])
  })

  it('reports a refused key as an error', async () => {
    const jev = createJevClient({ apiKey: KEY, fetchImpl: (async () => new Response('{"error":"no"}', { status: 401 })) as unknown as typeof fetch })
    await expect(jev.classify({ text: 'Pellacombe Tailors' }, cats)).rejects.toBeInstanceOf(OpenRouterError)
  })
})

describe('the key', () => {
  it.each([
    [KEY, true],
    ['  ' + KEY + '  ', true],
    ['sk-ant-0000000000000000000000000', false],
    ['sk-or-short', false],
    ['', false],
  ])('%s looks like an OpenRouter key: %s', (k, ok) => {
    expect(looksLikeOpenRouterKey(k)).toBe(ok)
  })

  it('is checked with OpenRouter and reports its label and limit', async () => {
    const ok = (async () => Response.json({ data: { label: 'local-ledger', limit: 5, usage: 0.12 } })) as unknown as typeof fetch
    expect(await checkKey(KEY, ok)).toEqual({ ok: true, label: 'local-ledger', limit: 5, usage: 0.12 })
    const bad = (async () => new Response('', { status: 401 })) as unknown as typeof fetch
    expect(await checkKey(KEY, bad)).toEqual({ ok: false, reason: 'invalid' })
  })
})
