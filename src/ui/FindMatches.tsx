import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { Category } from '../core/types'
import { changeCategory } from '../services/actions'
import { chosenClassifier, getSmartSorting } from '../services/classifier'
import { suggestForCategory, type CategorySuggestion } from '../services/suggest'
import { Button, Modal, Spinner } from './components'
import { money0, plural } from './format'
import type { AppData } from './useAppData'

type Step = { kind: 'intro' } | { kind: 'searching'; done: number; total: number } | { kind: 'results'; items: CategorySuggestion[]; offline: boolean; local: boolean } | { kind: 'moving' }

/** Suggest existing shops for a category (usually one just added); the user ticks which to move */
export function FindMatches({ category, data, isNew, onClose }: { category: Category; data: AppData; isNew?: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'intro' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const smart = useLiveQuery(getSmartSorting, []) === 'on'

  const search = async () => {
    setStep({ kind: 'searching', done: 0, total: 0 })
    let offline = false
    const classifier = await chosenClassifier((s) => (offline ||= s === 'offline'))
    const items = await suggestForCategory(category, data.transactions, data.categories, classifier, (done, total) => setStep({ kind: 'searching', done, total }))
    setPicked(new Set(items.filter((i) => i.confidence >= 0.5).map((i) => i.merchantKey)))
    setStep({ kind: 'results', items, offline, local: classifier.name === 'fallback' })
  }

  const move = async () => {
    setStep({ kind: 'moving' })
    for (const key of picked) {
      const t = data.transactions.find((x) => x.merchantKey === key)
      if (t) await changeCategory(t.id, category.id, 'merchant')
    }
    onClose()
  }

  const toggle = (key: string) => {
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPicked(next)
  }

  return (
    <Modal wide={step.kind === 'results'} onClose={step.kind === 'searching' || step.kind === 'moving' ? undefined : onClose}>
      <h2 className="text-xl font-semibold">
        {isNew ? `“${category.name}” added. ` : ''}Find shops for “{category.name}”
      </h2>

      {step.kind === 'intro' && (
        <>
          {smart ? (
            <>
              <p className="mt-2 text-ink-2">
                We'll ask the AI which of your shops fit “{category.name}” best, now that it's on the list. Only shop names are sent to OpenRouter, the same as when you add a
                statement. Nothing moves until you choose.
              </p>
              <p className="mt-2 text-sm text-muted">From now on, new shops are checked against this category automatically.</p>
            </>
          ) : (
            <p className="mt-2 text-ink-2">
              We'll look for shops whose names match “{category.name}”. Smart sorting is off, so this happens on this device and nothing is sent. Nothing moves until
              you choose.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button kind="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button kind="primary" onClick={search} autoFocus>
              Find shops
            </Button>
          </div>
        </>
      )}

      {step.kind === 'searching' && (
        <div className="flex flex-col items-center py-10 text-center text-ink-2">
          <Spinner />
          <div className="mt-3">Checking your shops{step.total ? ` (${step.done} of ${step.total})` : ''}…</div>
        </div>
      )}

      {step.kind === 'moving' && (
        <div className="flex flex-col items-center py-10 text-center text-ink-2">
          <Spinner />
          <div className="mt-3">Moving shops…</div>
        </div>
      )}

      {step.kind === 'results' && (
        <>
          {step.local && step.items.length > 0 && <p className="mt-2 text-sm text-ink-2">These shops' names match “{category.name}”.</p>}
          {step.offline && !step.local && (
            <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">The AI couldn't be reached, so these are shops whose names match “{category.name}”.</p>
          )}
          {step.items.length === 0 ? (
            <p className="mt-3 text-ink-2">No shops look like they belong in “{category.name}” yet. You can move any transaction to it yourself, and new shops will be checked against it.</p>
          ) : (
            <>
              <p className="mt-2 text-ink-2">
                Tick the shops to move. All their transactions move, and future ones from the same shop follow.
              </p>
              <ul className="mt-4 max-h-[50vh] divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10">
                {step.items.map((s) => (
                  <li key={s.merchantKey}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-black/[0.03]">
                      <input type="checkbox" checked={picked.has(s.merchantKey)} onChange={() => toggle(s.merchantKey)} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{s.merchant}</span>
                        <span className="block text-xs text-muted">
                          Now in {data.categoryById.get(s.currentCategoryId)?.name ?? 'Uncategorised'} · {plural(s.transactions, 'transaction')} ·{' '}
                          {s.reason === 'ai' ? `AI ${Math.round(s.confidence * 100)}% sure` : 'name matches'}
                        </span>
                      </span>
                      <span className="tabular shrink-0">{money0(s.spend)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button kind="ghost" onClick={onClose}>
              {step.items.length ? 'Cancel' : 'Close'}
            </Button>
            {step.items.length > 0 && (
              <Button kind="primary" onClick={move} disabled={!picked.size}>
                Move {plural(picked.size, 'shop')} to {category.name}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
