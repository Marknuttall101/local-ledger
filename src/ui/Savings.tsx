import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import type { SavingInsight } from '../core/savings'
import { db } from '../db/db'
import { recordAudit } from '../services/audits'
import type { Nav } from './App'
import { Button, Card, Empty, PageTitle } from './components'
import { dateLabel, money0, money } from './format'
import type { AppData } from './useAppData'

const ICONS: Record<SavingInsight['kind'], string> = {
  'foreign-fees': '🌏',
  'cash-advance': '🏧',
  interest: '📈',
  'account-fees': '💳',
  'overlapping-subscriptions': '📺',
  'price-rise': '⬆️',
  'spending-creep': '📊',
  takeaway: '🥡',
}

export function Savings({ data, savings, nav }: { data: AppData; savings: SavingInsight[]; nav: Nav }) {
  const total = savings.reduce((s, x) => s + x.yearlySaving, 0)
  const confirmed = useLiveQuery(() => db.confirmedSavings.orderBy('key').toArray(), []) ?? []
  const lastAudit = useLiveQuery(() => db.audits.orderBy('at').last(), [])
  const saved = confirmed.reduce((s, c) => s + c.yearlySaving, 0)

  // The ideas shown here are what this audit "found"; keep the record up to date with any fixes made since
  useEffect(() => {
    if (!data.isSample) recordAudit().catch((e) => console.error(e))
  }, [data.isSample, savings])

  return (
    <div>
      <PageTitle
        title="Ways to save"
        sub={savings.length ? <>We found up to <strong>{money0(total)} a year</strong> you could keep. Estimates are based on your recent spending.</> : undefined}
      />
      {confirmed.length > 0 && (
        <Card className="mb-6 border-good/30 bg-good-soft/40">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">You're saving {money0(saved)} a year</h2>
            <span className="text-xs text-muted">Confirmed by your statements</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {confirmed.map((c) => (
              <li key={c.key} className="flex justify-between gap-3">
                <span>{c.kind === 'cancelled' ? `Stopped ${c.merchant} (was ${money(c.from)})` : `${c.merchant} now ${money(c.to)}, down from ${money(c.from)}`}</span>
                <span className="tabular shrink-0 text-good">{money0(c.yearlySaving)} a year</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {savings.length === 0 && <Empty title="Nothing obvious to cut">No fees, overlapping subscriptions or creeping costs stood out. Check back after adding more statements.</Empty>}
      <div className="space-y-3">
        {savings.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-xl" aria-hidden>
              {ICONS[s.kind]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.title}</div>
              <p className="mt-1 text-sm text-ink-2">{s.detail}</p>
              {s.transactionIds.length > 0 && (
                <Button size="sm" kind="ghost" className="-ml-2.5 mt-2" onClick={() => nav.go('transactions', { filter: { ids: s.transactionIds, label: s.title } })}>
                  See the {s.transactionIds.length} transactions →
                </Button>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="tabular text-xl font-semibold text-good">{money0(s.yearlySaving)}</div>
              <div className="text-xs text-muted">a year</div>
            </div>
          </Card>
        ))}
      </div>
      {lastAudit && !data.isSample && (
        <p className="mt-6 text-sm text-muted">
          This audit covers your statements up to {dateLabel(lastAudit.dataThrough)}. Add next quarter's statements and we'll check which of these savings you've made: a
          cancelled subscription or a lower price shows up here.
        </p>
      )}
    </div>
  )
}
