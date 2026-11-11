import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeTx, monthly } from '../core/testing'
import { db, setMeta, useDatabase } from '../db/db'
import { recordAudit } from './audits'

let n = 0
beforeEach(async () => {
  useDatabase(`audits-${++n}`)
  await db.open()
})

/** Weekly groceries, so the card's statements clearly cover these months */
const groceries = (from: string, weeks: number, accountId = 'card') =>
  Array.from({ length: weeks }, (_, i) => makeTx(new Date(Date.parse(from) + i * 7 * 86_400_000).toISOString().slice(0, 10), -74, 'COLES 0719 VARNHOLT', { accountId }))

const firstHalf = () => [
  ...monthly('2026-01-05', 6, -18.49, 'NETFLIX.COM', { accountId: 'card', categoryId: 'streaming' }),
  ...monthly('2026-01-08', 6, -14, 'DISNEY PLUS', { accountId: 'card', categoryId: 'streaming' }),
  ...monthly('2026-01-10', 6, -12.49, 'SPOTIFY X9Q4', { accountId: 'card' }),
  ...monthly('2026-01-12', 6, -10.49, 'PRIME VIDEO', { accountId: 'savings' }),
  ...groceries('2026-01-03', 26),
  ...groceries('2026-01-03', 26, 'savings'),
]

describe('audits and confirmed savings', () => {
  it('confirms a cancelled and a cheaper subscription at the next audit', async () => {
    await db.transactions.bulkAdd(firstHalf())
    const first = await recordAudit(new Date('2026-07-01T00:00:00Z'))
    expect(first?.subscriptions.map((s) => s.merchant)).toEqual(expect.arrayContaining(['Netflix', 'Disney+', 'Spotify']))
    expect(await db.confirmedSavings.count()).toBe(0)

    // Next quarter: Netflix carries on, Disney+ stopped, Spotify moved to a cheaper plan.
    // The savings account's statements weren't uploaded, so Prime Video can't be judged.
    await db.transactions.bulkAdd([
      ...monthly('2026-07-05', 3, -18.49, 'NETFLIX.COM', { accountId: 'card' }),
      ...monthly('2026-07-10', 3, -10.49, 'SPOTIFY X9Q4', { accountId: 'card' }),
      ...groceries('2026-07-04', 13),
    ])
    const second = await recordAudit(new Date('2026-10-02T00:00:00Z'))
    expect(second?.id).not.toBe(first?.id)

    const confirmed = await db.confirmedSavings.toArray()
    expect(confirmed.map((c) => [c.kind, c.merchant]).sort()).toEqual([
      ['cancelled', 'Disney+'],
      ['cheaper', 'Spotify'],
    ])
    expect(confirmed.find((c) => c.kind === 'cancelled')?.yearlySaving).toBe(168)
    expect(confirmed.find((c) => c.kind === 'cheaper')?.yearlySaving).toBe(24)
  })

  it('treats uploads a few weeks apart as the same audit', async () => {
    await db.transactions.bulkAdd(firstHalf())
    const first = await recordAudit(new Date('2026-07-01T00:00:00Z'))
    await db.transactions.bulkAdd(groceries('2026-07-04', 2))
    const again = await recordAudit(new Date('2026-07-20T00:00:00Z'))
    expect(again?.id).toBe(first?.id)
    expect(again?.at).toBe(first?.at)
    expect(await db.audits.count()).toBe(1)
  })

  it('starts no new audit when nothing newer was added, however long it has been', async () => {
    await db.transactions.bulkAdd(firstHalf())
    await recordAudit(new Date('2026-07-01T00:00:00Z'))
    await recordAudit(new Date('2026-12-01T00:00:00Z'))
    expect(await db.audits.count()).toBe(1)
  })

  it('keeps the savings ideas shown at the audit', async () => {
    await db.transactions.bulkAdd(firstHalf())
    const audit = await recordAudit(new Date('2026-07-01T00:00:00Z'))
    // Netflix and Disney+ are both streaming: an overlap idea
    expect(audit?.savingsFound.map((s) => s.kind)).toContain('overlapping-subscriptions')
  })

  it('never records example data', async () => {
    await db.transactions.bulkAdd(firstHalf())
    await setMeta('sample', true)
    expect(await recordAudit()).toBeUndefined()
    expect(await db.audits.count()).toBe(0)
  })
})
