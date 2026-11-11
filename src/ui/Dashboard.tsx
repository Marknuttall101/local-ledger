import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dateRange, fullMonths, monthOf, monthsBetween, spendOf } from '../core/analytics'
import type { SavingInsight } from '../core/savings'
import { isBill, type Subscription } from '../core/subscriptions'
import type { Transaction } from '../core/types'
import type { Nav, TransactionFilter } from './App'
import { Button, Card, Dot, StatTile } from './components'
import { inPeriod, MultiPicker, PeriodPicker, periodBounds, type Period } from './Filters'
import { money, money0, monthLong, monthShort, plural } from './format'
import { monthlyTotals, OTHER_COLOR, pickSeries, SERIES_COLORS, type Series } from './chartData'
import { sortBy, type SortState } from './sort'
import { SortPicker, type SortChoice } from './SortControls'
import { useStoredState } from './state'
import type { AppData } from './useAppData'
import { ViewsMenu } from './Views'

type Level = { kind: 'all' } | { kind: 'group'; id: string } | { kind: 'category'; id: string }

/** Everything a saved dashboard view brings back */
interface DashboardView {
  period: Period
  accountIds: string[]
  hidden: string[]
  level: Level
  rowSort: SortState
}

interface Row {
  id: string
  /** Key in the left-out set: "g:<group>", "c:<category>" or "m:<shop>" */
  hideKey: string
  name: string
  color: string
  total: number
  hidden: boolean
}

/** Rows left out of the totals, remembered in this browser */
function useStoredSet(key: string): [Set<string>, (s: Set<string>) => void] {
  const [list, setList] = useStoredState<string[]>(key, [])
  const value = useMemo(() => new Set(list), [list])
  return [value, (s) => setList([...s])]
}

const ROW_SORTS: SortChoice[] = [
  { label: 'Biggest first', sort: { key: 'total', dir: 'desc' } },
  { label: 'Smallest first', sort: { key: 'total', dir: 'asc' } },
  { label: 'Name A–Z', sort: { key: 'name', dir: 'asc' } },
]

export function periodLabel(p: Period): string {
  if (p.kind === 'all') return 'all time'
  if (p.kind === 'last') return `last ${p.months} months`
  return p.from === p.to ? monthShort(p.from) : `${monthShort(p.from)} – ${monthShort(p.to)}`
}

export function Dashboard({ data, insights, nav }: { data: AppData; insights: { subscriptions: Subscription[]; savings: SavingInsight[]; openFlags: unknown[]; reviewShops: number }; nav: Nav }) {
  const [period, setPeriod] = useStoredState<Period>('dashboard.period', { kind: 'last', months: 12 })
  const [chosenAccounts, setAccountIds] = useStoredState<string[]>('dashboard.accounts', [])
  const [hidden, setHidden] = useStoredSet('dashboard.hidden')
  const [storedLevel, setLevel] = useStoredState<Level>('dashboard.level', { kind: 'all' })
  const [rowSort, setRowSort] = useStoredState<SortState>('dashboard.rowSort', ROW_SORTS[0].sort)
  const [chartType, setChartType] = useStoredState<'bars' | 'lines'>('dashboard.chartType', 'bars')
  const [splitChart, setSplitChart] = useStoredState('dashboard.splitChart', false)
  // A remembered account, group or category may have been deleted since
  const accountIds = chosenAccounts.filter((id) => data.accounts.some((a) => a.id === id))
  const level: Level =
    (storedLevel.kind === 'group' && !data.groupById.has(storedLevel.id)) || (storedLevel.kind === 'category' && !data.categoryById.has(storedLevel.id)) ? { kind: 'all' } : storedLevel

  const span = useMemo(() => dateRange(data.transactions), [data.transactions])
  const latest = span?.last ?? new Date().toISOString().slice(0, 10)
  const bounds = periodBounds(period, latest)

  const groupOf = (t: Transaction) => data.categoryById.get(t.categoryId)?.groupId ?? 'other'
  const accountOk = (t: Transaction) => !accountIds.length || accountIds.includes(t.accountId)
  const isHidden = (t: Transaction) => hidden.has(`g:${groupOf(t)}`) || hidden.has(`c:${t.categoryId}`) || hidden.has(`m:${t.merchantKey}`)
  /** Counts towards the headline numbers: chosen accounts, not left out */
  const counts = (t: Transaction) => accountOk(t) && !isHidden(t)

  const txs = data.transactions.filter((t) => accountOk(t) && inPeriod(t.date, bounds))
  const inLevel = (t: Transaction) => (level.kind === 'all' ? true : level.kind === 'group' ? groupOf(t) === level.id : t.categoryId === level.id)
  const scoped = txs.filter(inLevel)
  const visible = scoped.filter((t) => !isHidden(t))

  const toggleHidden = (key: string) => {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setHidden(next)
  }

  // Rows one level down from where we are. Left-out rows stay listed (greyed) so they can be ticked again.
  const rowKind = level.kind === 'all' ? 'g' : level.kind === 'group' ? 'c' : 'm'
  const keyOf = (t: Transaction) => (level.kind === 'all' ? groupOf(t) : level.kind === 'group' ? t.categoryId : t.merchantKey)
  const levelId = level.kind === 'all' ? '' : level.id
  const stableOrder = useMemo(() => {
    const totals = new Map<string, number>()
    for (const t of data.transactions) if (accountOk(t) && inLevel(t)) totals.set(keyOf(t), (totals.get(keyOf(t)) ?? 0) + spendOf(t))
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    // Deliberately depends only on the data, the level and the chosen accounts (not the period or
    // hidden items), so rows keep their place while the user filters
  }, [data.transactions, level.kind, levelId, accountIds.join(',')])
  const rows: Row[] = (() => {
    const shown = new Map<string, number>()
    const all = new Map<string, number>()
    const names = new Map<string, string>()
    for (const t of scoped) {
      const s = spendOf(t)
      if (!s) continue
      const k = keyOf(t)
      all.set(k, (all.get(k) ?? 0) + s)
      if (!isHidden(t)) shown.set(k, (shown.get(k) ?? 0) + s)
      if (level.kind === 'category') names.set(k, t.merchant)
    }
    // Groups keep their own colour. Inside a group or category, each row gets a series colour by
    // its all-time spend, so changing the period never repaints a shop
    const colorOf = (k: string) => {
      if (level.kind === 'all') return data.groupById.get(k)?.color ?? OTHER_COLOR
      const rank = stableOrder.indexOf(k)
      return rank >= 0 && rank < SERIES_COLORS.length ? SERIES_COLORS[rank] : OTHER_COLOR
    }
    const nameOf = (k: string) =>
      level.kind === 'all' ? (data.groupById.get(k)?.name ?? 'Other') : level.kind === 'group' ? (data.categoryById.get(k)?.name ?? k) : (names.get(k) ?? k)
    return [...all.keys()]
      .map((id) => {
        const hideKey = `${rowKind}:${id}`
        const off = hidden.has(hideKey)
        return { id, hideKey, name: nameOf(id), color: colorOf(id), total: off ? all.get(id)! : (shown.get(id) ?? 0), hidden: off }
      })
      .filter((r) => r.hidden || r.total > 0.005)
      .sort((a, b) => b.total - a.total)
  })()
  // Left-out rows go last, whatever the order
  const sortedRows = [...sortBy(rows.filter((r) => !r.hidden), rowSort, { total: (r) => r.total, name: (r) => r.name }), ...rows.filter((r) => r.hidden)]
  const shownRows = rows.filter((r) => !r.hidden)
  const total = shownRows.reduce((s, r) => s + r.total, 0)

  // Monthly chart: one series per row on the left (groups, categories or shops), or a single total
  const split = level.kind === 'all' || splitChart
  const totalColor = level.kind === 'all' ? SERIES_COLORS[0] : (data.groupById.get(level.kind === 'group' ? level.id : (data.categoryById.get(level.id)?.groupId ?? ''))?.color ?? SERIES_COLORS[0])
  const chart = (() => {
    const r = dateRange(txs)
    if (!r) return { data: [] as Array<Record<string, string | number>>, keys: [] as Series[] }
    const months = monthsBetween(monthOf(r.first), monthOf(r.last))
    const keys: Series[] = !split ? [{ id: 'value', name: 'Spending', color: totalColor }] : level.kind === 'all' ? shownRows : pickSeries(shownRows)
    return { data: monthlyTotals(visible, months, (t) => (split ? keyOf(t) : 'value'), keys.map((k) => k.id)), keys }
  })()
  const splitLabel = level.kind === 'group' ? 'By category' : 'By shop'

  // Headline numbers follow the chosen accounts and left-out rows, but not the period
  const full = fullMonths(data.transactions)
  const lastMonth = full.at(-1) ?? monthOf(latest)
  const spentLastMonth = data.transactions.filter((t) => monthOf(t.date) === lastMonth && counts(t)).reduce((s, t) => s + spendOf(t), 0)
  const avgMonths = full.slice(-7, -1)
  const avg = avgMonths.length ? data.transactions.filter((t) => avgMonths.includes(monthOf(t.date)) && counts(t)).reduce((s, t) => s + spendOf(t), 0) / avgMonths.length : 0
  const activeSubs = insights.subscriptions.filter((s) => s.active && !isBill(s))
  const subsMonthly = activeSubs.reduce((s, x) => s + x.monthlyCost, 0)
  const savingsYear = insights.savings.reduce((s, x) => s + x.yearlySaving, 0)
  const diff = avg ? (spentLastMonth - avg) / avg : 0

  const title = level.kind === 'all' ? 'All spending' : level.kind === 'group' ? data.groupById.get(level.id)?.name : data.categoryById.get(level.id)?.name
  const filterFor = (extra: Partial<TransactionFilter>, label: string): TransactionFilter => ({
    ...extra,
    accountIds,
    period,
    hidden: [...hidden],
    label: period.kind === 'all' ? label : `${label} · ${periodLabel(period)}`,
  })
  const seeTransactions = (r: Row) => {
    const extra = level.kind === 'all' ? { groupId: r.id } : level.kind === 'group' ? { categoryId: r.id } : { merchantKey: r.id }
    // A left-out row still shows its own transactions when asked for directly
    nav.go('transactions', { filter: { ...filterFor(extra, r.name), hidden: r.hidden ? [] : [...hidden] } })
  }
  const seeLevel = () => {
    const extra = level.kind === 'all' ? {} : level.kind === 'group' ? { groupId: level.id } : { categoryId: level.id }
    nav.go('transactions', { filter: filterFor(extra, title ?? 'All spending') })
  }
  // Shops are the last level: only the Transactions button leaves the dashboard
  const drill = (r: Row) => {
    if (level.kind === 'all') setLevel({ kind: 'group', id: r.id })
    else if (level.kind === 'group') setLevel({ kind: 'category', id: r.id })
  }
  const RowBody = level.kind === 'category' ? 'div' : 'button'
  const crumbs: Array<{ label: string; to: Level }> = [{ label: 'All spending', to: { kind: 'all' } }]
  if (level.kind !== 'all') {
    const gid = level.kind === 'group' ? level.id : data.categoryById.get(level.id)?.groupId
    if (gid) crumbs.push({ label: data.groupById.get(gid)?.name ?? gid, to: { kind: 'group', id: gid } })
    if (level.kind === 'category') crumbs.push({ label: data.categoryById.get(level.id)?.name ?? level.id, to: level })
  }

  const hiddenLabel = (key: string) => {
    const kind = key.slice(0, 1)
    const id = key.slice(2)
    if (kind === 'g') return data.groupById.get(id)?.name ?? id
    if (kind === 'c') return data.categoryById.get(id)?.name ?? id
    return data.transactions.find((t) => t.merchantKey === id)?.merchant ?? id
  }
  const accountOptions = data.accounts.map((a) => ({ id: a.id, label: `${a.label}${a.suffix ? ` ···${a.suffix}` : ''}` }))

  return (
    <div>
      <Card className="mb-6 bg-gradient-to-br from-brand-soft/50 to-surface">
        <p className="text-lg leading-relaxed sm:text-xl">
          You spent <strong>{money0(spentLastMonth)}</strong> in {monthLong(lastMonth)}
          {avg > 0 && Math.abs(diff) >= 0.05 && (
            <>
              {' '}
              — <span className={diff > 0 ? 'text-bad' : 'text-good'}>{Math.round(Math.abs(diff) * 100)}% {diff > 0 ? 'more' : 'less'} than usual</span>
            </>
          )}
          . We found{' '}
          <button className="font-semibold text-brand underline decoration-brand/30 underline-offset-4" onClick={() => nav.go('subscriptions')}>
            {plural(activeSubs.length, 'subscription')} ({money0(subsMonthly)}/month)
          </button>{' '}
          and{' '}
          <button className="font-semibold text-brand underline decoration-brand/30 underline-offset-4" onClick={() => nav.go('savings')}>
            {plural(insights.savings.length, 'way')} to save
          </button>
          {savingsYear > 0 && <> — up to {money0(savingsYear)} a year</>}.
        </p>
        {(insights.reviewShops > 0 || insights.openFlags.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {insights.reviewShops > 0 && (
              <Button size="sm" onClick={() => nav.go('transactions', { filter: { needsLook: true, label: 'Needs a quick look' } })}>
                {plural(insights.reviewShops, 'shop')} to check the category of
              </Button>
            )}
            {insights.openFlags.length > 0 && (
              <Button size="sm" onClick={() => nav.go('review')}>
                {plural(insights.openFlags.length, 'charge')} to review
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Spent in ${monthLong(lastMonth).split(' ')[0]}`}
          value={money0(spentLastMonth)}
          sub={avg ? `${diff >= 0 ? '+' : '−'}${Math.round(Math.abs(diff) * 100)}% vs your average` : undefined}
          tone={avg ? (diff > 0.05 ? 'bad' : diff < -0.05 ? 'good' : undefined) : undefined}
        />
        <StatTile label="Average month" value={avg ? money0(avg) : '—'} sub={avgMonths.length ? `over ${plural(avgMonths.length, 'month')}` : undefined} />
        <StatTile label="Subscriptions" value={`${money0(subsMonthly)}/mo`} sub={`${money0(subsMonthly * 12)} a year`} />
        <StatTile label="Possible savings" value={`${money0(savingsYear)}/yr`} sub={plural(insights.savings.length, 'idea')} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodPicker value={period} onChange={setPeriod} first={span?.first} last={span?.last} />
        {data.accounts.length > 1 && <MultiPicker noun="account" allLabel="All accounts" options={accountOptions} value={accountIds} onChange={setAccountIds} />}
        <div className="ml-auto">
          <ViewsMenu<DashboardView>
            page="dashboard"
            current={{ period, accountIds: chosenAccounts, hidden: [...hidden], level: storedLevel, rowSort }}
            onApply={(v) => {
              setPeriod(v.period ?? { kind: 'last', months: 12 })
              setAccountIds(v.accountIds ?? [])
              setHidden(new Set(v.hidden ?? []))
              setLevel(v.level ?? { kind: 'all' })
              setRowSort(v.rowSort ?? ROW_SORTS[0].sort)
            }}
          />
        </div>
      </div>
      {hidden.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-ink-2">Left out of totals:</span>
          {[...hidden].map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-black/[0.06] px-2.5 py-0.5">
              {hiddenLabel(k)}
              <button className="text-muted hover:text-ink" onClick={() => toggleHidden(k)} aria-label={`Include ${hiddenLabel(k)} again`}>
                ×
              </button>
            </span>
          ))}
          <button className="ml-1 text-brand hover:underline" onClick={() => setHidden(new Set())}>
            Include everything
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="mb-1 flex flex-wrap items-center gap-1 text-sm text-ink-2">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted">›</span>}
                {i < crumbs.length - 1 ? (
                  <button className="hover:text-ink hover:underline" onClick={() => setLevel(c.to)}>
                    {c.label}
                  </button>
                ) : (
                  <span>{c.label}</span>
                )}
              </span>
            ))}
          </div>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <span className="flex items-baseline gap-3">
              <button className="text-xs text-brand hover:underline" onClick={seeLevel}>
                See transactions
              </button>
              <span className="tabular text-lg font-semibold">{money0(total)}</span>
            </span>
          </div>
          {rows.length > 1 && (
            <div className="mb-2">
              <SortPicker choices={ROW_SORTS} value={rowSort} onChange={setRowSort} />
            </div>
          )}
          {rows.length === 0 && <p className="text-ink-2">No spending in this period.</p>}
          <ul className="space-y-0.5">
            {sortedRows.slice(0, 20).map((r) => (
              <li key={r.id} className={`flex items-center gap-1 rounded-lg hover:bg-black/[0.04] ${r.hidden ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={!r.hidden}
                  onChange={() => toggleHidden(r.hideKey)}
                  className="ml-2 shrink-0"
                  title={r.hidden ? 'Include in totals and chart' : 'Leave out of totals and chart'}
                  aria-label={`Include ${r.name}`}
                />
                <RowBody onClick={() => drill(r)} className="min-w-0 flex-1 px-2 py-1.5 text-left" title={level.kind === 'category' ? undefined : 'Break this down'}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot color={r.color} />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="tabular shrink-0">
                      {money0(r.total)}
                      {!r.hidden && total > 0 && <span className="text-muted"> · {Math.round((r.total / total) * 100)}%</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-black/[0.05]">
                    {!r.hidden && shownRows[0] && <div className="h-full rounded-full" style={{ width: `${Math.max(1, (r.total / shownRows[0].total) * 100)}%`, background: r.color }} />}
                  </div>
                </RowBody>
                <button onClick={() => seeTransactions(r)} className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-brand-soft" title={`See ${r.name} transactions`}>
                  Transactions
                </button>
              </li>
            ))}
          </ul>
          {rows.length > 20 && <p className="mt-2 px-2 text-xs text-muted">+ {rows.length - 20} more</p>}
          <p className="mt-3 px-2 text-xs text-muted">
            {level.kind === 'category' ? 'Click Transactions to see a shop’s transactions.' : 'Click a row to break it down.'} Untick a row to leave it out of the totals and chart.
          </p>
        </Card>

        <Card className="lg:col-span-3">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Spending by month</h2>
              <p className="text-sm text-ink-2">{title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {level.kind !== 'all' && (
                <Toggle
                  label="Show"
                  value={splitChart ? 'split' : 'total'}
                  options={[
                    ['total', 'Total'],
                    ['split', splitLabel],
                  ]}
                  onChange={(v) => setSplitChart(v === 'split')}
                />
              )}
              <Toggle
                label="Chart"
                value={chartType}
                options={[
                  ['bars', 'Bars'],
                  ['lines', 'Lines'],
                ]}
                onChange={(v) => setChartType(v as 'bars' | 'lines')}
              />
            </div>
          </div>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'lines' ? (
                <LineChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e1e0d9" />
                  <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => money0(v)} tickLine={false} axisLine={false} width={64} />
                  <Tooltip
                    cursor={{ stroke: '#c3c2b7' }}
                    formatter={(v, name) => [money(Number(v)), chart.keys.find((k) => k.id === name)?.name ?? name]}
                    labelFormatter={(l) => monthLong(String(l))}
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontSize: 13 }}
                    itemStyle={{ color: '#0b0b0b' }}
                  />
                  {chart.keys.map((k) => (
                    <Line
                      key={k.id}
                      dataKey={k.id}
                      type="linear"
                      stroke={k.color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: k.color, stroke: '#fcfcfb', strokeWidth: 1 }}
                      activeDot={{ r: 5, stroke: '#fcfcfb', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              ) : (
              <BarChart data={chart.data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#e1e0d9" />
                <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => money0(v)} tickLine={false} axisLine={false} width={64} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(v, name) => [money(Number(v)), chart.keys.find((k) => k.id === name)?.name ?? name]}
                  labelFormatter={(l) => monthLong(String(l))}
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontSize: 13 }}
                  itemStyle={{ color: '#0b0b0b' }}
                />
                {chart.keys.map((k, i) => (
                  <Bar
                    key={k.id}
                    dataKey={k.id}
                    stackId="s"
                    fill={k.color}
                    stroke="#fcfcfb"
                    strokeWidth={chart.keys.length > 1 ? 1 : 0}
                    radius={i === chart.keys.length - 1 ? [4, 4, 0, 0] : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          {chart.keys.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              {chart.keys.map((k) => (
                <span key={k.id} className="flex items-center gap-1.5">
                  <Dot color={k.color} /> {k.name}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Biggest subscriptions</h2>
            <Button size="sm" kind="ghost" onClick={() => nav.go('subscriptions')}>
              See all →
            </Button>
          </div>
          {activeSubs.length === 0 && <p className="text-ink-2">No regular subscriptions found yet.</p>}
          <ul className="divide-y divide-black/5">
            {activeSubs.slice(0, 5).map((s) => (
              <li key={s.merchantKey} className="flex items-center justify-between py-2 text-sm">
                <span>{s.merchant}</span>
                <span className="tabular">
                  {money(s.monthlyCost)}/mo <span className="text-muted">· {money0(s.yearlyCost)}/yr</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Top ways to save</h2>
            <Button size="sm" kind="ghost" onClick={() => nav.go('savings')}>
              See all →
            </Button>
          </div>
          {insights.savings.length === 0 && <p className="text-ink-2">Nothing obvious — nice work.</p>}
          <ul className="divide-y divide-black/5">
            {insights.savings.slice(0, 4).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{s.title}</span>
                <span className="tabular shrink-0 font-medium text-good">{money0(s.yearlySaving)}/yr</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

/** A small switch between two or three options, e.g. Bars | Lines */
function Toggle({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-black/10 bg-surface p-0.5 text-xs" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={`rounded-lg px-2.5 py-1 ${value === v ? 'bg-black/[0.07] font-medium' : 'text-ink-2'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}
