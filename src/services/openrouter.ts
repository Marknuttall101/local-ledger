/**
 * Talks to Jev (TypeSafe AI's decision model) through OpenRouter's Decisions API, straight from
 * the browser with the user's own key. There is no server in between.
 *
 * What is sent per shop: the cleaned shop name, the town the bank printed (if any), and the user's
 * list of category names and hints. Never amounts, dates, balances, account details or the bank's
 * original wording. See merchantsNeedingAi() in core/categorise.ts for how shops are chosen, and
 * isSafeToSend() below for the last check before anything leaves the browser.
 */

export const OPENROUTER_ORIGIN = 'https://openrouter.ai'
export const DEFAULT_MODEL = 'typesafe/jev-1.13'
const DECISION_URLS = [`${OPENROUTER_ORIGIN}/api/v1/alpha/decisions`, `${OPENROUTER_ORIGIN}/api/alpha/decisions`]

export interface CategoryOption {
  id: string
  name: string
  hint: string
}

export interface JevAnswer {
  categoryId: string
  confidence: number
  subscriptionLikelihood: number
  suspiciousLikelihood: number
}

export interface ShopToSort {
  text: string
  place?: string
}

const MAX_TEXT = 60

/**
 * Last check before a shop name leaves the browser: short, no runs of digits (which could be an
 * account, card or reference number), and a place that is only a town or state name.
 */
export function isSafeToSend(shop: ShopToSort): boolean {
  return (
    shop.text.length > 0 &&
    shop.text.length <= MAX_TEXT &&
    !/\d{4,}/.test(shop.text) &&
    (shop.place === undefined || /^[A-Za-z ]{2,40}$/.test(shop.place))
  )
}

export function buildJevRequest(model: string, shop: ShopToSort, categories: CategoryOption[]) {
  const where = shop.place ? ` (the bank listed the town as "${shop.place}")` : ''
  return {
    model,
    state: `A merchant name as it appears on an Australian bank or credit card statement: "${shop.text}"${where}`,
    questions: {
      category: {
        type: 'choice',
        instructions: 'Which spending category does a purchase from this merchant most likely belong to? Go by what the business actually does or sells.',
        criteria: Object.fromEntries(categories.map((c) => [c.id, `${c.name}: ${c.hint}`])),
      },
      subscription: {
        type: 'noul',
        instructions: 'Is this merchant a recurring subscription service (billed automatically every week, month or year)?',
        criteria: {
          true: 'A subscription or membership service, such as streaming, software, gyms, phone or internet plans.',
          false: 'A shop, restaurant or one-off purchase.',
        },
      },
      suspicious: {
        type: 'noul',
        instructions: 'Does this merchant name look like a scam, a card-testing charge or otherwise suspicious?',
        criteria: {
          true: 'Unrecognisable, scam-like or commonly associated with card fraud.',
          false: 'A normal, recognisable business.',
        },
      },
    },
  }
}

interface JevResponse {
  answers?: {
    category?: { choice?: string; confidence?: number; probabilities?: Record<string, number> }
    subscription?: { noul?: number }
    suspicious?: { noul?: number }
  }
}

export function parseJevResponse(body: JevResponse, categoryIds: Set<string>): JevAnswer | undefined {
  const cat = body.answers?.category
  if (!cat?.choice || !categoryIds.has(cat.choice)) return undefined
  const confidence = cat.confidence ?? cat.probabilities?.[cat.choice] ?? 0
  const clamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
  return {
    categoryId: cat.choice,
    confidence: clamp(confidence),
    subscriptionLikelihood: clamp(body.answers?.subscription?.noul),
    suspiciousLikelihood: clamp(body.answers?.suspicious?.noul),
  }
}

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`OpenRouter request failed (${status}) ${detail.slice(0, 200)}`)
  }
}

export interface JevClientOptions {
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export function createJevClient(opts: JevClientOptions) {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const model = opts.model ?? DEFAULT_MODEL
  let workingUrl: string | undefined

  const post = (url: string, payload: unknown) =>
    doFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        // Shown on the key owner's OpenRouter activity page, so they can see what used their key
        'X-Title': 'Local Ledger',
      },
      body: JSON.stringify(payload),
      // No cookies or referrer go to OpenRouter
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    })

  return {
    async classify(shop: ShopToSort, categories: CategoryOption[]): Promise<JevAnswer | undefined> {
      if (!isSafeToSend(shop)) return undefined
      const payload = buildJevRequest(model, shop, categories)
      let lastError = ''
      // OpenRouter's Decisions API is in alpha; try the known paths and remember the one that works
      for (const url of workingUrl ? [workingUrl] : DECISION_URLS) {
        const res = await post(url, payload)
        if (res.status === 404 || res.status === 405) {
          lastError = `${res.status} at ${url}`
          continue
        }
        if (!res.ok) throw new OpenRouterError(res.status, await res.text().catch(() => ''))
        workingUrl = url
        return parseJevResponse((await res.json()) as JevResponse, new Set(categories.map((c) => c.id)))
      }
      throw new OpenRouterError(404, lastError)
    },
  }
}

/** Checks a key with OpenRouter (GET /api/v1/key) and returns its label and spending limit */
export async function checkKey(apiKey: string, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  const res = await fetchImpl(`${OPENROUTER_ORIGIN}/api/v1/key`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401) return { ok: false as const, reason: 'invalid' as const }
  if (!res.ok) return { ok: false as const, reason: 'unreachable' as const }
  const body = (await res.json()) as { data?: { label?: string; limit?: number | null; usage?: number } }
  return { ok: true as const, label: body.data?.label, limit: body.data?.limit ?? null, usage: body.data?.usage }
}
