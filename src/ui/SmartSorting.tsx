import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getApiKey } from '../services/apiKey'
import { createAiClassifier, getSmartSorting, setSmartSorting } from '../services/classifier'
import { recheckUnsureShops, unsureShops } from '../services/importer'
import { ApiKeyForm } from './ApiKey'
import { Button } from './components'
import { plural } from './format'

type Run = { kind: 'key' } | { kind: 'busy'; done: number; total: number } | { kind: 'done'; text: string }

/**
 * Smart sorting is off until the user says yes. When shops are left unsorted, ask once, with the
 * exact promise: only shop names are sent, using the user's own OpenRouter key. The answer is
 * remembered; Settings → Privacy changes it.
 */
export function SmartSortingPrompt({ isSample }: { isSample: boolean }) {
  const state = useLiveQuery(async () => {
    const choice = await getSmartSorting()
    return { choice, unsorted: choice === 'ask' ? (await unsureShops()).length : 0 }
  }, [])
  const [run, setRun] = useState<Run>()

  if (isSample) return null
  if (!run && (state?.choice !== 'ask' || !state.unsorted)) return null

  const sort = async () => {
    const key = getApiKey()
    if (!key) {
      setRun({ kind: 'key' })
      return
    }
    await setSmartSorting('on')
    setRun({ kind: 'busy', done: 0, total: state?.unsorted ?? 0 })
    let offline = false
    const result = await recheckUnsureShops(
      createAiClassifier(key, (s) => (offline ||= s === 'offline')),
      (done, total) => setRun({ kind: 'busy', done, total }),
    )
    setRun({
      kind: 'done',
      text:
        offline && !result.checked
          ? "Smart sorting is on, but OpenRouter couldn't be reached just now. Try again from Settings → Your data."
          : `Sorted ${plural(result.checked, 'shop')} with AI. Anything it wasn't sure about is under Transactions → Needs a quick look.`,
    })
  }

  const decline = async () => {
    await setSmartSorting('off')
    setRun({ kind: 'done', text: 'OK — sorting stays on this device. You can change this any time in Settings → Privacy.' })
  }

  const n = state?.unsorted ?? 0
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand-soft/50 px-4 py-3 text-sm">
      {run?.kind === 'done' ? (
        <>
          <span>{run.text}</span>
          <button className="text-ink-2 hover:text-ink" onClick={() => setRun(undefined)} aria-label="Dismiss">
            ×
          </button>
        </>
      ) : run?.kind === 'busy' ? (
        <span>
          Sorting with AI… {run.done} of {plural(run.total, 'shop')}
        </span>
      ) : run?.kind === 'key' ? (
        <div className="flex w-full flex-col gap-2">
          <span>
            Smart sorting uses your own OpenRouter API key. Only the names of shops we don't recognise (and the town the bank listed) are sent to OpenRouter —
            never amounts, dates or account details.
          </span>
          <ApiKeyForm onSaved={sort} />
        </div>
      ) : (
        <>
          <span>
            <strong>{plural(n, 'shop')}</strong> couldn't be sorted. Sort {n === 1 ? 'it' : 'them'} with AI? Only shop names are sent, using your own OpenRouter key.
          </span>
          <span className="flex gap-2">
            <Button size="sm" kind="ghost" onClick={decline}>
              No thanks
            </Button>
            <Button size="sm" kind="primary" onClick={sort}>
              Sort with AI
            </Button>
          </span>
        </>
      )}
    </div>
  )
}
