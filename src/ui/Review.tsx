import { useState } from 'react'
import { sortBy, type SortState } from './sort'
import { SortPicker, type SortChoice } from './SortControls'
import { useStoredState } from './state'
import type { FraudFlag } from '../core/fraud'
import { markFraud, undoFraudDecision } from '../services/actions'
import { Badge, Button, Card, Empty, PageTitle } from './components'
import { accountName, dateLabel, money, plural } from './format'
import { TransactionEditor } from './TransactionEditor'
import type { Transaction } from '../core/types'
import type { AppData } from './useAppData'

const SORT_CHOICES: SortChoice[] = [
  { label: 'Newest first', sort: { key: 'date', dir: 'desc' } },
  { label: 'Oldest first', sort: { key: 'date', dir: 'asc' } },
  { label: 'Biggest amount', sort: { key: 'size', dir: 'desc' } },
  { label: 'Smallest amount', sort: { key: 'size', dir: 'asc' } },
  { label: 'Shop A–Z', sort: { key: 'shop', dir: 'asc' } },
]

export function Review({ data, flags }: { data: AppData; flags: FraudFlag[] }) {
  const [showDone, setShowDone] = useStoredState('review.showDone', false)
  const [sort, setSort] = useStoredState<SortState>('review.sort', SORT_CHOICES[0].sort)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const byId = new Map(data.transactions.map((t) => [t.id, t]))
  const open = sortBy(
    flags.filter((f) => !data.decisions.has(f.transactionId) && byId.has(f.transactionId)),
    sort,
    { date: (f) => byId.get(f.transactionId)!.date, size: (f) => Math.abs(byId.get(f.transactionId)!.amount), shop: (f) => byId.get(f.transactionId)!.merchant },
  )
  const notMe = flags.filter((f) => data.decisions.get(f.transactionId)?.verdict === 'not-me')
  const legitCount = [...data.decisions.values()].filter((d) => d.verdict === 'legit' && !d.key.startsWith('merchant:')).length

  return (
    <div>
      <PageTitle title="Review" sub="Charges that look a little unusual. Most will be fine — tell us, and we’ll learn what’s normal for you." />

      {notMe.length > 0 && (
        <Card className="mb-6 border-bad/40 bg-bad-soft/60">
          <div className="font-semibold text-bad">⚠ {plural(notMe.length, 'charge')} you don't recognise</div>
          <p className="mt-1 text-sm text-ink-2">
            Call your bank using the number on the back of your card. They can block the card and dispute these charges. Many banks also let you lock your card instantly in their app.
          </p>
          <ul className="mt-3 divide-y divide-bad/10">
            {notMe.map((f) => {
              const t = byId.get(f.transactionId)
              if (!t) return null
              return (
                <li key={f.transactionId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    {dateLabel(t.date)} · <strong>{t.merchant}</strong> · <span className="text-ink-2">{accountName(data.accounts, t.accountId)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular font-medium">{money(t.amount)}</span>
                    <Button size="sm" kind="ghost" onClick={() => undoFraudDecision(t.id)}>
                      Undo
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {open.length === 0 ? (
        <Empty title="Nothing to review">
          Nothing looks out of the ordinary.{legitCount > 0 && ` You've confirmed ${plural(legitCount, 'charge')} as yours.`}
        </Empty>
      ) : (
        <div className="space-y-3">
          {open.length > 1 && (
            <div className="flex justify-end">
              <SortPicker choices={SORT_CHOICES} value={sort} onChange={setSort} />
            </div>
          )}
          {open.map((f) => {
            const t = byId.get(f.transactionId)
            if (!t) return null
            return (
              <Card key={f.transactionId} className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.merchant}</span>
                    <span className="text-sm text-muted">
                      {dateLabel(t.date)} · {accountName(data.accounts, t.accountId)}
                    </span>
                    {t.foreign && <Badge>Overseas</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">{t.rawDescription}</div>
                  <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
                    {f.reasons.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </div>
                <div className="tabular text-lg font-semibold">{money(t.amount)}</div>
                <div className="flex flex-wrap gap-2">
                  <Button kind="ghost" onClick={() => setEditing(t)} title="Rename the shop or change its category">
                    ✎ Edit
                  </Button>
                  <Button onClick={() => markFraud(t.id, 'legit')}>✓ That's me</Button>
                  <Button kind="danger" onClick={() => markFraud(t.id, 'not-me')}>
                    Not me
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {legitCount > 0 && (
        <div className="mt-6">
          <Button kind="ghost" size="sm" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} what you've already confirmed ({legitCount})
          </Button>
          {showDone && (
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              {[...data.decisions.values()]
                .filter((d) => d.verdict === 'legit' && !d.key.startsWith('merchant:'))
                .map((d) => {
                  const t = byId.get(d.key)
                  return t ? (
                    <li key={d.key} className="flex items-center gap-2">
                      {dateLabel(t.date)} · {t.merchant} · {accountName(data.accounts, t.accountId)} · {money(t.amount)}
                      <Button size="sm" kind="ghost" onClick={() => undoFraudDecision(t.id)}>
                        Undo
                      </Button>
                    </li>
                  ) : null
                })}
            </ul>
          )}
        </div>
      )}
      {editing && <TransactionEditor data={data} transaction={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
