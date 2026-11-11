import { currentPriceRise, isBill, overlappingSubscriptions, type Subscription } from '../core/subscriptions'
import type { Nav } from './App'
import { Badge, Button, Card, Dot, Empty, PageTitle, StatTile } from './components'
import { accountName, cadenceLabel, dateLabel, money, money0, plural } from './format'
import { sortBy, type SortState } from './sort'
import { SortPicker, type SortChoice } from './SortControls'
import { useStoredState } from './state'
import type { AppData } from './useAppData'

const SORT_CHOICES: SortChoice[] = [
  { label: 'Costs the most', sort: { key: 'cost', dir: 'desc' } },
  { label: 'Costs the least', sort: { key: 'cost', dir: 'asc' } },
  { label: 'Name A–Z', sort: { key: 'name', dir: 'asc' } },
  { label: 'Next charge soonest', sort: { key: 'next', dir: 'asc' } },
  { label: 'Charged most recently', sort: { key: 'last', dir: 'desc' } },
]

export function Subscriptions({ data, subscriptions, nav }: { data: AppData; subscriptions: Subscription[]; nav: Nav }) {
  const [showStopped, setShowStopped] = useStoredState('subscriptions.showStopped', false)
  const [sort, setSort] = useStoredState<SortState>('subscriptions.sort', SORT_CHOICES[0].sort)
  const sorted = (list: Subscription[]) =>
    sortBy(list, sort, { cost: (s) => s.yearlyCost, name: (s) => s.merchant, next: (s) => s.nextExpected, last: (s) => s.lastDate })
  const active = sorted(subscriptions.filter((s) => s.active && !isBill(s)))
  const bills = sorted(subscriptions.filter((s) => s.active && isBill(s)))
  const stopped = sorted(subscriptions.filter((s) => !s.active))
  const monthly = active.reduce((s, x) => s + x.monthlyCost, 0)
  const overlaps = overlappingSubscriptions(subscriptions)

  if (!subscriptions.length) {
    return (
      <div>
        <PageTitle title="Subscriptions" />
        <Empty title="No regular payments found yet">We look for charges that repeat on a regular rhythm. Adding a few months of statements helps us spot them.</Empty>
      </div>
    )
  }

  const colorOf = (s: Subscription) => data.groupById.get(data.categoryById.get(s.categoryId)?.groupId ?? '')?.color ?? '#898781'
  const accountOf = new Map(data.transactions.map((t) => [t.id, t.accountId]))
  /** The account(s) a subscription is charged to */
  const accountsOf = (s: Subscription) => [...new Set(s.transactionIds.map((id) => accountOf.get(id)).filter((id): id is string => !!id))].map((id) => accountName(data.accounts, id)).join(', ')

  return (
    <div>
      <PageTitle title="Subscriptions" sub="Everything that charges you on a regular rhythm — including the ones that are easy to forget." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Active subscriptions" value={active.length} />
        <StatTile label="Per month" value={money0(monthly)} />
        <StatTile label="Per year" value={money0(monthly * 12)} sub="what these cost you over 12 months" />
      </div>

      {overlaps.map((g) => (
        <Card key={g.categoryId} className="mb-4 border-warn/40 bg-warn-soft/50">
          <div className="font-medium">
            You have {g.subscriptions.length} {data.categoryById.get(g.categoryId)?.name} subscriptions — {money(g.monthlyCost)} a month
          </div>
          <div className="mt-1 text-sm text-ink-2">{g.subscriptions.map((s) => s.merchant).join(', ')}. Do you use them all?</div>
        </Card>
      ))}

      <div className="mb-3 flex justify-end">
        <SortPicker choices={SORT_CHOICES} value={sort} onChange={setSort} />
      </div>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-black/5">
          {active.map((s) => (
            <SubRow key={s.merchantKey + s.cadence} s={s} color={colorOf(s)} category={data.categoryById.get(s.categoryId)?.name} account={accountsOf(s)} nav={nav} />
          ))}
        </ul>
      </Card>

      {bills.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Regular bills</h2>
          <p className="mb-3 text-sm text-ink-2">Rent, energy, insurance and other bills that come round regularly — not counted as subscriptions above.</p>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-black/5">
              {bills.map((s) => (
                <SubRow key={s.merchantKey + s.cadence} s={s} color={colorOf(s)} category={data.categoryById.get(s.categoryId)?.name} account={accountsOf(s)} nav={nav} />
              ))}
            </ul>
          </Card>
        </div>
      )}

      {stopped.length > 0 && (
        <div className="mt-6">
          <Button kind="ghost" onClick={() => setShowStopped(!showStopped)}>
            {showStopped ? '▾' : '▸'} {plural(stopped.length, 'subscription')} that seem to have stopped
          </Button>
          {showStopped && (
            <Card className="mt-2 overflow-hidden p-0 opacity-80">
              <ul className="divide-y divide-black/5">
                {stopped.map((s) => (
                  <SubRow key={s.merchantKey + s.cadence} s={s} color={colorOf(s)} category={data.categoryById.get(s.categoryId)?.name} account={accountsOf(s)} nav={nav} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">Something missing or wrong? Subscriptions are worked out from your transactions, so adding more months of statements makes this more accurate.</p>
    </div>
  )
}

function SubRow({ s, color, category, account, nav }: { s: Subscription; color: string; category?: string; account: string; nav: Nav }) {
  const rise = currentPriceRise(s)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <Dot color={color} />
      <div className="min-w-0 flex-1">
        <button className="font-medium hover:underline" onClick={() => nav.go('transactions', { filter: { ids: s.transactionIds, label: s.merchant } })}>
          {s.merchant}
        </button>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{category}</span>·<span>{cadenceLabel[s.cadence]}</span>·<span>since {dateLabel(s.firstDate)}</span>·<span>{account}</span>
          {rise && (
            <Badge tone="warn">
              ↑ {money(rise.from)} → {money(rise.to)}
            </Badge>
          )}
        </div>
      </div>
      <div className="text-right text-sm">
        <div className="tabular font-medium">
          {money(s.amount)} <span className="font-normal text-muted">{cadenceLabel[s.cadence].toLowerCase()}</span>
        </div>
        <div className="tabular text-xs text-muted">{money0(s.yearlyCost)} a year</div>
      </div>
      <div className="w-40 text-right text-xs text-ink-2">
        {s.active ? (
          <>
            Last charged {dateLabel(s.lastDate)}
            <br />
            Next around {dateLabel(s.nextExpected)}
          </>
        ) : (
          <>Last charged {dateLabel(s.lastDate)}</>
        )}
      </div>
    </li>
  )
}
