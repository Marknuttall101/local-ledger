import { useMemo, useState } from 'react'
import { dateRange } from '../core/analytics'
import { needsReview, oddShopName, shopsToReview } from '../core/categorise'
import type { Transaction } from '../core/types'
import { changeCategory, confirmCategory } from '../services/actions'
import type { Nav, TransactionFilter } from './App'
import { Badge, Button, Card, Empty, Modal, PageTitle } from './components'
import { accountName, dateLabel, money, plural } from './format'
import { CategorySelect } from './CategorySelect'
import { inPeriod, MultiPicker, PeriodPicker, periodBounds, type Period } from './Filters'
import { sortBy, type SortState } from './sort'
import { SortPicker, type SortChoice } from './SortControls'
import { useStoredState } from './state'
import { TransactionEditor } from './TransactionEditor'
import { ViewsMenu } from './Views'
import type { AppData } from './useAppData'

const PAGE = 100

/** Everything a saved Transactions view brings back */
interface TransactionsView {
  search: string
  categoryIds: string[]
  accountIds: string[]
  period: Period
  needsLook: boolean
  preset: TransactionFilter | null
  sort: SortState
}

const SORT_CHOICES: SortChoice[] = [
  { label: 'Newest first', sort: { key: 'date', dir: 'desc' } },
  { label: 'Oldest first', sort: { key: 'date', dir: 'asc' } },
  { label: 'Biggest amount', sort: { key: 'size', dir: 'desc' } },
  { label: 'Smallest amount', sort: { key: 'size', dir: 'asc' } },
  { label: 'Shop A–Z', sort: { key: 'shop', dir: 'asc' } },
  { label: 'Category A–Z', sort: { key: 'category', dir: 'asc' } },
]

export function Transactions({ data, filter }: { data: AppData; filter?: TransactionFilter; nav: Nav }) {
  // Remembered between visits; a link from another page (e.g. a dashboard row) starts afresh with its filter
  const linked = <T,>(value: T) => (filter ? value : undefined)
  const [search, setSearch] = useStoredState('transactions.search', '', linked(''))
  const [chosenCategories, setCategoryIds] = useStoredState<string[]>(
    'transactions.categories',
    [],
    linked(filter?.categoryId ? [filter.categoryId] : filter?.groupId ? data.categories.filter((c) => c.groupId === filter.groupId).map((c) => c.id) : []),
  )
  const [chosenAccounts, setAccountIds] = useStoredState<string[]>('transactions.accounts', [], linked(filter?.accountIds ?? []))
  const [period, setPeriod] = useStoredState<Period>('transactions.period', { kind: 'all' }, linked(filter?.period ?? { kind: 'all' }))
  const [needsLook, setNeedsLook] = useStoredState('transactions.needsLook', false, linked(!!filter?.needsLook))
  const [storedPreset, setPreset] = useStoredState<TransactionFilter | null>('transactions.preset', null, linked(filter ?? null))
  const preset = storedPreset ?? undefined
  const [sort, setSort] = useStoredState<SortState>('transactions.sort', { key: 'date', dir: 'desc' })
  // Categories or accounts deleted since they were chosen are ignored
  const categoryIds = useMemo(() => chosenCategories.filter((id) => data.categoryById.has(id)), [chosenCategories, data.categoryById])
  const accountIds = useMemo(() => chosenAccounts.filter((id) => data.accounts.some((a) => a.id === id)), [chosenAccounts, data.accounts])
  const [limit, setLimit] = useState(PAGE)
  const [pending, setPending] = useState<{ t: Transaction; categoryId: string; count: number } | undefined>()
  const [editing, setEditing] = useState<Transaction | undefined>()

  const merchantCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of data.transactions) m.set(t.merchantKey, (m.get(t.merchantKey) ?? 0) + 1)
    return m
  }, [data.transactions])

  const span = useMemo(() => dateRange(data.transactions), [data.transactions])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const ids = preset?.ids ? new Set(preset.ids) : undefined
    const cats = new Set(categoryIds)
    const bounds = periodBounds(period, span?.last ?? '')
    // Shops, categories and groups left out on the dashboard stay left out here
    const hidden = new Set(preset?.hidden ?? [])
    const groupOf = (t: Transaction) => data.categoryById.get(t.categoryId)?.groupId ?? 'other'
    const filtered = data.transactions.filter(
      (t) =>
        (!ids || ids.has(t.id)) &&
        (!preset?.merchantKey || t.merchantKey === preset.merchantKey) &&
        (!cats.size || cats.has(t.categoryId)) &&
        (!accountIds.length || accountIds.includes(t.accountId)) &&
        inPeriod(t.date, bounds) &&
        (!hidden.size || !(hidden.has(`g:${groupOf(t)}`) || hidden.has(`c:${t.categoryId}`) || hidden.has(`m:${t.merchantKey}`))) &&
        (!needsLook || needsReview(t)) &&
        (!q || t.merchant.toLowerCase().includes(q) || t.rawDescription.toLowerCase().includes(q) || t.amount.toFixed(2).includes(q)),
    )
    if (!needsLook)
      return sortBy(filtered, sort, {
        date: (t) => t.date,
        size: (t) => Math.abs(t.amount),
        shop: (t) => t.merchant,
        category: (t) => data.categoryById.get(t.categoryId)?.name ?? '',
      })
    // Biggest-spend shops first, each shop's transactions together
    const spendByShop = new Map<string, number>()
    for (const t of filtered) spendByShop.set(t.merchantKey, (spendByShop.get(t.merchantKey) ?? 0) - t.amount)
    return [...filtered].sort((a, b) => spendByShop.get(b.merchantKey)! - spendByShop.get(a.merchantKey)! || a.merchantKey.localeCompare(b.merchantKey) || b.date.localeCompare(a.date))
  }, [data.transactions, data.categoryById, search, categoryIds, accountIds, period, span, needsLook, preset, sort])

  const onPick = (t: Transaction, newCat: string) => {
    if (newCat === t.categoryId) return
    const count = merchantCounts.get(t.merchantKey) ?? 1
    if (count <= 1) changeCategory(t.id, newCat, 'merchant')
    else setPending({ t, categoryId: newCat, count })
  }

  const reviewCount = shopsToReview(data.transactions)
  const total = list.reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <PageTitle
        title="Transactions"
        sub={needsLook ? 'We weren’t sure about these shops. Pick the right category, or tap ✓ Right if our guess is correct — it applies to every transaction from that shop, now and in future.' : `${plural(list.length, 'transaction')} · net ${money(total)}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shops or amounts"
          className="min-w-56 flex-1 rounded-xl border border-black/10 bg-surface px-3 py-2 text-sm"
        />
        <MultiPicker
          noun="category"
          allLabel="All categories"
          options={data.categories.map((c) => ({ id: c.id, label: c.name, group: data.groupById.get(c.groupId)?.name ?? 'Other' }))}
          value={categoryIds}
          onChange={setCategoryIds}
        />
        {data.accounts.length > 1 && (
          <MultiPicker
            noun="account"
            allLabel="All accounts"
            options={data.accounts.map((a) => ({ id: a.id, label: `${a.label}${a.suffix ? ` ···${a.suffix}` : ''}` }))}
            value={accountIds}
            onChange={setAccountIds}
          />
        )}
        <button
          onClick={() => setNeedsLook(!needsLook)}
          className={`rounded-xl border px-3 py-2 text-sm ${needsLook ? 'border-warn bg-warn-soft font-medium text-warn' : 'border-black/10 bg-surface text-ink-2'}`}
        >
          Check categories{reviewCount ? ` (${plural(reviewCount, 'shop')})` : ''}
        </button>
        {preset?.label && !preset.needsLook && (preset.merchantKey || preset.ids || preset.hidden?.length) && (
          <span className="inline-flex items-center gap-1 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">
            {preset.merchantKey || preset.ids ? preset.label : `Leaving out ${plural(preset.hidden!.length, 'row')} you unticked on the dashboard`}
            <button className="ml-1 font-semibold" onClick={() => setPreset(null)} aria-label="Clear filter">
              ×
            </button>
          </span>
        )}
      </div>
      <div className="mb-4 -mt-2 flex flex-wrap items-center justify-between gap-2">
        <PeriodPicker value={period} onChange={setPeriod} first={span?.first} last={span?.last} />
        <div className="flex flex-wrap items-center gap-2">
          {!needsLook && <SortPicker choices={SORT_CHOICES} value={sort} onChange={setSort} />}
          <ViewsMenu<TransactionsView>
            page="transactions"
            current={{ search, categoryIds: chosenCategories, accountIds: chosenAccounts, period, needsLook, preset: storedPreset, sort }}
            onApply={(v) => {
              setSearch(v.search ?? '')
              setCategoryIds(v.categoryIds ?? [])
              setAccountIds(v.accountIds ?? [])
              setPeriod(v.period ?? { kind: 'all' })
              setNeedsLook(!!v.needsLook)
              setPreset(v.preset ?? null)
              setSort(v.sort ?? SORT_CHOICES[0].sort)
            }}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <Empty title={needsLook ? 'All sorted!' : 'No transactions match'}>{needsLook ? 'Every transaction has a category you’ve confirmed or we’re confident about.' : 'Try a different search or filter.'}</Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-black/5">
            {list.slice(0, limit).map((t) => {
              const review = needsReview(t)
              return (
                <li key={t.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap ${review ? 'bg-warn-soft/40' : ''}`}>
                  <div className="w-24 shrink-0 text-sm text-ink-2">{dateLabel(t.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button className="truncate text-left font-medium hover:text-brand hover:underline" onClick={() => setEditing(t)} title="Edit shop name or category">
                        {t.merchant}
                      </button>
                      <button className="shrink-0 text-xs text-muted hover:text-brand" onClick={() => setEditing(t)} aria-label="Edit">
                        ✎ Edit
                      </button>
                      {t.foreign && <Badge>Overseas</Badge>}
                      {t.isTransfer && <Badge tone="brand">Transfer</Badge>}
                      {oddShopName(t.merchant) && (
                        <span title="This name looks like leftover bank wording. Click Edit to rename it — you can rename every transaction with the same key word at once.">
                          <Badge tone="warn">Odd name</Badge>
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted" title={t.rawDescription}>
                      {t.rawDescription}
                      {`${t.rawDescription ? ' · ' : ''}${accountName(data.accounts, t.accountId)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {review && (
                      <Button size="sm" kind="ghost" className="text-good" onClick={() => confirmCategory(t.id)} title="Our guess is right">
                        ✓ Right
                      </Button>
                    )}
                    <CategorySelect data={data} value={t.categoryId} onChange={(c) => onPick(t, c)} highlight={review} />
                  </div>
                  <div className={`tabular w-24 shrink-0 text-right font-medium ${t.amount > 0 ? 'text-good' : ''}`}>{money(t.amount)}</div>
                </li>
              )
            })}
          </ul>
          {list.length > limit && (
            <div className="border-t border-black/5 p-3 text-center">
              <Button kind="ghost" onClick={() => setLimit(limit + PAGE * 3)}>
                Show more ({list.length - limit} left)
              </Button>
            </div>
          )}
        </Card>
      )}

      {editing && <TransactionEditor data={data} transaction={editing} onClose={() => setEditing(undefined)} />}

      {pending && (
        <Modal onClose={() => setPending(undefined)}>
          <h2 className="text-lg font-semibold">Change {pending.t.merchant}?</h2>
          <p className="mt-1 text-ink-2">
            Move to <strong>{data.categoryById.get(pending.categoryId)?.name}</strong>.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              kind="primary"
              size="lg"
              autoFocus
              onClick={() => {
                changeCategory(pending.t.id, pending.categoryId, 'merchant')
                setPending(undefined)
              }}
            >
              All {pending.count} from {pending.t.merchant}, and future ones
            </Button>
            <Button
              onClick={() => {
                changeCategory(pending.t.id, pending.categoryId, 'one')
                setPending(undefined)
              }}
            >
              Just this one
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
