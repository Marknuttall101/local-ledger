import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { csvCell } from '../core/csvSafe'
import type { CorrectionLog, Transaction } from '../core/types'
import { db } from '../db/db'
import { Badge, Button, Card, PageTitle, StatTile } from './components'
import { accountName, dateLabel, money, money0, plural, sourceLabel } from './format'
import { sortBy, type SortState } from './sort'
import { SortHeader } from './SortControls'
import { useStoredState } from './state'
import { TransactionEditor } from './TransactionEditor'
import type { AppData } from './useAppData'

type View = 'shops' | 'transactions'
type SourceFilter = 'all' | 'ai' | 'builtin' | 'you' | 'changed' | 'unsorted' | 'transfer'

interface ShopRow {
  key: string
  name: string
  examples: string[]
  count: number
  spend: number
  categoryId: string
  first: Transaction
  sources: Set<string>
  verdict?: 'confirmed' | 'changed'
  changedFrom?: string
}

/**
 * Everything in one place: what the bank said, what the AI chose and how sure it was, and whether
 * you agreed. Used to check the AI is doing a good job.
 */
export function Audit({ data }: { data: AppData }) {
  const corrections = useLiveQuery(() => db.corrections.orderBy('at').toArray(), []) ?? []
  const [view, setView] = useStoredState<View>('audit.view', 'shops')
  const [source, setSource] = useStoredState<SourceFilter>('audit.source', 'all')
  const [search, setSearch] = useStoredState('audit.search', '')
  const [shopSort, setShopSort] = useStoredState<SortState>('audit.shopSort', { key: 'spend', dir: 'desc' })
  const [txSort, setTxSort] = useStoredState<SortState>('audit.txSort', { key: 'date', dir: 'desc' })
  const [limit, setLimit] = useState(150)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const catName = (id: string) => data.categoryById.get(id)?.name ?? id

  // Latest merchant-wide decision per shop: did the user keep the AI's choice or change it?
  const verdicts = useMemo(() => {
    const m = new Map<string, CorrectionLog>()
    for (const c of corrections) if (c.scope === 'merchant') m.set(c.merchantKey, c)
    return m
  }, [corrections])

  const shops: ShopRow[] = useMemo(() => {
    const m = new Map<string, ShopRow>()
    for (const t of data.transactions) {
      let r = m.get(t.merchantKey)
      if (!r) {
        r = { key: t.merchantKey, name: t.merchant, examples: [], count: 0, spend: 0, categoryId: t.categoryId, first: t, sources: new Set() }
        m.set(t.merchantKey, r)
      }
      r.count++
      r.spend -= t.amount
      r.sources.add(t.categorySource)
      if (r.examples.length < 2 && !r.examples.includes(t.rawDescription)) r.examples.push(t.rawDescription)
    }
    for (const r of m.values()) {
      const v = verdicts.get(r.key)
      if (v) {
        r.verdict = v.aiCategoryId === v.userCategoryId ? 'confirmed' : 'changed'
        if (r.verdict === 'changed') r.changedFrom = v.aiCategoryId
      }
    }
    return [...m.values()].sort((a, b) => b.spend - a.spend)
  }, [data.transactions, verdicts])

  // Jev scorecard: of the shops Jev sorted that you've since looked at, how many did you keep?
  const jevShops = shops.filter((s) => data.insights.get(s.key)?.source === 'ai')
  const reviewed = jevShops.filter((s) => s.verdict && verdicts.get(s.key)?.aiSource === 'ai')
  const agreed = reviewed.filter((s) => s.verdict === 'confirmed').length
  const avgConfidence = jevShops.length ? jevShops.reduce((sum, s) => sum + (data.insights.get(s.key)?.confidence ?? 0), 0) / jevShops.length : 0

  const counts = {
    builtin: data.transactions.filter((t) => t.categorySource === 'builtin').length,
    ai: data.transactions.filter((t) => t.categorySource === 'ai').length,
    you: data.transactions.filter((t) => t.categorySource === 'user' || (t.categorySource === 'rule' && t.categoryId !== 'income')).length,
    transfer: data.transactions.filter((t) => t.categorySource === 'transfer').length,
    unsorted: data.transactions.filter((t) => t.categoryId === 'uncategorised').length,
  }

  const matchesSource = (t: Transaction, shop?: ShopRow) => {
    switch (source) {
      case 'ai':
        return t.categorySource === 'ai'
      case 'builtin':
        return t.categorySource === 'builtin'
      case 'you':
        return t.categorySource === 'user' || t.categorySource === 'rule'
      case 'changed':
        return (shop ?? shops.find((s) => s.key === t.merchantKey))?.verdict === 'changed' || !!t.manualOverride
      case 'unsorted':
        return t.categoryId === 'uncategorised'
      case 'transfer':
        return t.isTransfer
      default:
        return true
    }
  }
  const q = search.trim().toLowerCase()
  const matchesSearch = (name: string, raw: string[], categoryId: string) =>
    !q || name.toLowerCase().includes(q) || raw.some((r) => r.toLowerCase().includes(q)) || catName(categoryId).toLowerCase().includes(q)

  const shopList = sortBy(
    shops.filter((s) => matchesSource(s.first, s) && matchesSearch(s.name, s.examples, s.categoryId)),
    shopSort,
    {
      shop: (s) => s.name,
      category: (s) => catName(s.categoryId),
      how: (s) => sourceLabel(s.first),
      pick: (s) => (data.insights.get(s.key)?.source === 'ai' ? data.insights.get(s.key)!.confidence : -1),
      spend: (s) => s.spend,
    },
  )
  const txList = sortBy(
    data.transactions.filter((t) => matchesSource(t) && matchesSearch(t.merchant, [t.rawDescription], t.categoryId)),
    txSort,
    {
      date: (t) => t.date,
      account: (t) => accountName(data.accounts, t.accountId),
      statement: (t) => t.rawDescription,
      shop: (t) => t.merchant,
      category: (t) => catName(t.categoryId),
      how: (t) => sourceLabel(t),
      amount: (t) => Math.abs(t.amount),
    },
  )

  const download = () => {
    const header = ['Date', 'Account', 'On statement', 'Shop', 'Category', 'Group', 'How sorted', 'AI pick', 'AI confidence', 'Amount']
    const rows = data.transactions.map((t) => {
      const ins = data.insights.get(t.merchantKey)
      const cat = data.categoryById.get(t.categoryId)
      const acc = data.accounts.find((a) => a.id === t.accountId)
      return [
        t.date,
        acc ? `${acc.label}${acc.suffix ? ` ${acc.suffix}` : ''}` : '',
        t.rawDescription,
        t.merchant,
        cat?.name ?? t.categoryId,
        data.groupById.get(cat?.groupId ?? '')?.name ?? '',
        sourceLabel(t),
        ins?.source === 'ai' ? catName(ins.categoryId) : '',
        ins?.source === 'ai' ? ins.confidence.toFixed(2) : '',
        t.amount.toFixed(2),
      ]
    })
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `local-ledger-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const filters: Array<[SourceFilter, string, number?]> = [
    ['all', 'Everything'],
    ['ai', 'Sorted by the AI', counts.ai],
    ['builtin', 'Known shops', counts.builtin],
    ['you', 'Your choices', counts.you],
    ['changed', 'You changed'],
    ['unsorted', 'Not sorted', counts.unsorted],
    ['transfer', 'Transfers', counts.transfer],
  ]

  return (
    <div>
      <PageTitle
        title="Audit"
        sub="Every transaction and how it was sorted — what your bank wrote, what the AI picked and how sure it was, and what you changed."
        actions={<Button onClick={download}>Download as spreadsheet (CSV)</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Shops sorted by the AI" value={jevShops.length} sub={jevShops.length ? `average ${Math.round(avgConfidence * 100)}% sure` : 'none yet'} />
        <StatTile
          label="AI agreed with you"
          value={reviewed.length ? `${Math.round((agreed / reviewed.length) * 100)}%` : '—'}
          sub={reviewed.length ? `${agreed} of ${plural(reviewed.length, 'shop')} you've checked` : 'check some shops to see a score'}
          tone={reviewed.length ? (agreed / reviewed.length >= 0.8 ? 'good' : 'bad') : undefined}
        />
        <StatTile label="Known shops" value={plural(counts.builtin, 'transaction')} sub="sorted instantly, nothing sent" />
        <StatTile label="Not sorted yet" value={plural(counts.unsorted, 'transaction')} tone={counts.unsorted ? 'bad' : 'good'} sub={counts.unsorted ? 'pick a category to fix' : 'all sorted'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-black/10 bg-surface p-0.5 text-sm">
          {(
            [
              ['shops', 'By shop'],
              ['transactions', 'By transaction'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1 ${view === v ? 'bg-black/[0.07] font-medium' : 'text-ink-2'}`}>
              {l}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shop, statement text or category"
          className="min-w-56 flex-1 rounded-xl border border-black/10 bg-surface px-3 py-1.5 text-sm"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setSource(id)}
            className={`rounded-full border px-3 py-1 text-xs ${source === id ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-black/10 bg-surface text-ink-2'}`}
          >
            {label}
            {n !== undefined ? ` · ${n}` : ''}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        {view === 'shops' ? (
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs text-ink-2">
              <tr>
                <SortHeader label="Shop · on your statement" k="shop" firstDir="asc" sort={shopSort} onSort={setShopSort} className="px-4 py-2" />
                <SortHeader label="Category" k="category" firstDir="asc" sort={shopSort} onSort={setShopSort} className="px-3 py-2" />
                <SortHeader label="How sorted" k="how" firstDir="asc" sort={shopSort} onSort={setShopSort} className="px-3 py-2" />
                <SortHeader label="AI's pick" k="pick" sort={shopSort} onSort={setShopSort} className="px-3 py-2" />
                <th className="px-3 py-2 font-medium">You</th>
                <SortHeader label="Spend" k="spend" sort={shopSort} onSort={setShopSort} className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {shopList.slice(0, limit).map((s) => {
                const ins = data.insights.get(s.key)
                return (
                  <tr key={s.key} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => setEditing(s.first)}>
                    <td className="max-w-72 px-4 py-2">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="truncate text-xs text-muted" title={s.examples.join(' · ')}>
                        {s.examples.join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{catName(s.categoryId)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{sourceLabel(s.first)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                      {ins?.source === 'ai' ? (
                        <>
                          {catName(ins.categoryId)} <ConfidenceBadge value={ins.confidence} />
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {s.verdict === 'confirmed' && <Badge tone="good">✓ Confirmed</Badge>}
                      {s.verdict === 'changed' && <Badge tone="warn">Changed from {catName(s.changedFrom ?? '')}</Badge>}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">
                      {money0(s.spend)}
                      <div className="text-xs text-muted">{plural(s.count, 'transaction')}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs text-ink-2">
              <tr>
                <SortHeader label="Date" k="date" sort={txSort} onSort={setTxSort} className="px-4 py-2" />
                <SortHeader label="Account" k="account" firstDir="asc" sort={txSort} onSort={setTxSort} className="px-3 py-2" />
                <SortHeader label="On your statement" k="statement" firstDir="asc" sort={txSort} onSort={setTxSort} className="px-3 py-2" />
                <SortHeader label="Shop" k="shop" firstDir="asc" sort={txSort} onSort={setTxSort} className="px-3 py-2" />
                <SortHeader label="Category" k="category" firstDir="asc" sort={txSort} onSort={setTxSort} className="px-3 py-2" />
                <SortHeader label="How sorted" k="how" firstDir="asc" sort={txSort} onSort={setTxSort} className="px-3 py-2" />
                <SortHeader label="Amount" k="amount" sort={txSort} onSort={setTxSort} className="px-4 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {txList.slice(0, limit).map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => setEditing(t)}>
                  <td className="whitespace-nowrap px-4 py-2 text-ink-2">{dateLabel(t.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{accountName(data.accounts, t.accountId)}</td>
                  <td className="max-w-64 truncate px-3 py-2 text-xs text-muted" title={t.rawDescription}>
                    {t.rawDescription}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 font-medium">{t.merchant}</td>
                  <td className="whitespace-nowrap px-3 py-2">{catName(t.categoryId)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{sourceLabel(t)}</td>
                  <td className={`tabular whitespace-nowrap px-4 py-2 text-right ${t.amount > 0 ? 'text-good' : ''}`}>{money(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(view === 'shops' ? shopList : txList).length > limit && (
          <div className="border-t border-black/5 p-3 text-center">
            <Button kind="ghost" onClick={() => setLimit(limit + 300)}>
              Show more ({(view === 'shops' ? shopList : txList).length - limit} left)
            </Button>
          </div>
        )}
      </Card>
      <p className="mt-3 text-sm text-muted">Click any row to rename the shop or change its category.</p>

      {editing && <TransactionEditor data={data} transaction={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return <Badge tone={value >= 0.8 ? 'good' : value >= 0.6 ? 'neutral' : 'warn'}>{pct}%</Badge>
}
