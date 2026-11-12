import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { deleteAllData, loadSampleData } from '../services/actions'
import { recordAudit } from '../services/audits'
import { getSmartSorting } from '../services/classifier'
import { keepDataOnThisDevice } from '../services/storage'
import { recleanMerchants, updateStarterCategories } from '../services/importer'
import { Badge, Button, Spinner } from './components'
import { Audit } from './Audit'
import { Dashboard } from './Dashboard'
import type { Period } from './Filters'
import { ImportFlow, type Done } from './ImportFlow'
import { plural } from './format'
import { Landing } from './Landing'
import { privacyHref } from './routes'
import { Review } from './Review'
import { Savings } from './Savings'
import { Settings } from './Settings'
import { SmartSortingPrompt } from './SmartSorting'
import { Subscriptions } from './Subscriptions'
import { Transactions } from './Transactions'
import { useAppData, useInsights } from './useAppData'

export type Page = 'dashboard' | 'transactions' | 'subscriptions' | 'savings' | 'review' | 'audit' | 'settings'

export interface Nav {
  go: (page: Page, opts?: { filter?: TransactionFilter }) => void
}

export interface TransactionFilter {
  categoryId?: string
  groupId?: string
  /** Only these accounts (empty or missing = all) */
  accountIds?: string[]
  period?: Period
  /** Leave out shops, categories and groups hidden on the dashboard ("g:id", "c:id", "m:key") */
  hidden?: string[]
  merchantKey?: string
  needsLook?: boolean
  ids?: string[]
  label?: string
}

export function App() {
  const data = useAppData()
  const insights = useInsights(data)
  const [page, setPage] = useState<Page>('dashboard')
  const [filter, setFilter] = useState<TransactionFilter | undefined>()
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [lastImport, setLastImport] = useState<Done[] | undefined>()
  const smartSorting = useLiveQuery(getSmartSorting, [])

  const nav: Nav = {
    go: (p, opts) => {
      setFilter(opts?.filter)
      setPage(p)
      window.scrollTo({ top: 0 })
    },
  }

  const addFiles = useCallback((list: FileList | File[]) => {
    const picked = [...list].filter((f) => /\.(pdf|csv|txt)$/i.test(f.name) || /pdf|csv/.test(f.type))
    if (picked.length) setFiles((prev) => [...prev, ...picked])
  }, [])

  // One-off tidy-ups after an update: new starter categories, better shop names
  useEffect(() => {
    updateStarterCategories()
      .then(recleanMerchants)
      .catch((e) => console.error(e))
  }, [])

  // Once there's real data here, ask the browser not to clear it (Safari otherwise may after 7 days away)
  const hasOwnData = data.transactions.length > 0 && !data.isSample
  useEffect(() => {
    if (hasOwnData) keepDataOnThisDevice()
  }, [hasOwnData])

  // Drop a statement anywhere on the page
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [addFiles])

  const trySample = async () => {
    setLoadingSample(true)
    try {
      await loadSampleData()
      nav.go('dashboard')
    } finally {
      setLoadingSample(false)
    }
  }

  const startOwn = async () => {
    if (data.isSample) await deleteAllData()
  }

  const importing = files.length > 0 && (
    <ImportFlow
      files={files}
      replacingSample={data.isSample}
      onFinished={(results) => {
        recordAudit().catch((e) => console.error(e))
        setFiles([])
        setLastImport(results)
        nav.go('dashboard')
      }}
      onCancel={() => setFiles([])}
      beforeSave={startOwn}
    />
  )

  const dropOverlay = dragging && (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand/10 backdrop-blur-[1px]">
      <div className="rounded-2xl border-2 border-dashed border-brand bg-surface px-10 py-8 text-center shadow-lg">
        <div className="text-lg font-semibold">Drop your statement</div>
        <div className="mt-1 text-sm text-ink-2">PDF or CSV · read on this device, the file is never uploaded</div>
      </div>
    </div>
  )

  if (!data.loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-2">
        <Spinner />
      </div>
    )
  }

  // The import queue stays in the same place on screen whether we show the welcome page or the
  // app, so switching between them mid-import doesn't restart it
  const shell = (content: React.ReactNode) => (
    <>
      {content}
      {dropOverlay}
      {importing}
    </>
  )

  if (!data.transactions.length || loadingSample) {
    return shell(<Landing onFiles={addFiles} onSample={trySample} loadingSample={loadingSample} />)
  }

  const tabs: Array<{ id: Page; label: string; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'transactions', label: 'Transactions', count: insights.reviewShops },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'savings', label: 'Ways to save' },
    { id: 'review', label: 'Review', count: insights.openFlags.length },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
  ]

  return shell(
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:flex-nowrap">
          <button className="flex items-center gap-2 font-semibold tracking-tight" onClick={() => nav.go('dashboard')}>
            <Logo /> Local Ledger
          </button>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => nav.go(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${page === t.id ? 'bg-black/[0.07] font-medium text-ink' : 'text-ink-2 hover:bg-black/[0.04]'}`}
              >
                {t.label}
                {!!t.count && <Badge tone={t.id === 'review' ? 'bad' : 'warn'}>{t.count}</Badge>}
              </button>
            ))}
          </nav>
          <label className="ml-auto shrink-0 md:ml-0">
            <input type="file" accept=".pdf,.csv,.txt" multiple className="sr-only" onChange={(e) => e.target.files && addFiles(e.target.files)} />
            <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-[#184f95]">
              + Add statement
            </span>
          </label>
        </div>
      </header>

      {data.isSample && (
        <div className="border-b border-black/10 bg-brand-soft/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span>
              You're exploring <strong>example data</strong> for a made-up person. Categories are pre-filled from a saved smart-sorting run. Nothing was sent.
            </span>
            <div className="flex gap-2">
              <label>
                <input type="file" accept=".pdf,.csv,.txt" multiple className="sr-only" onChange={(e) => e.target.files && addFiles(e.target.files)} />
                <span className="inline-flex cursor-pointer rounded-lg bg-brand px-3 py-1 font-medium text-white">Upload my statement</span>
              </label>
              <Button size="sm" kind="ghost" onClick={() => deleteAllData()}>
                Clear example
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8">
        {lastImport && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-good/30 bg-good-soft/60 px-4 py-3 text-sm">
            <span>
              ✓ Added <strong>{plural(lastImport.reduce((s, r) => s + r.added, 0), 'new transaction')}</strong>
              {lastImport.length > 1 && ` from ${lastImport.length} statements`}
              {lastImport.some((r) => r.duplicates) && (
                <> · {plural(lastImport.reduce((s, r) => s + r.duplicates, 0), 'transaction')} you'd already added were skipped, so nothing is counted twice</>
              )}
              .
            </span>
            <button className="text-ink-2 hover:text-ink" onClick={() => setLastImport(undefined)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        <SmartSortingPrompt isSample={data.isSample} />
        {page === 'dashboard' && <Dashboard data={data} insights={insights} nav={nav} />}
        {page === 'transactions' && <Transactions data={data} filter={filter} nav={nav} key={JSON.stringify(filter ?? {})} />}
        {page === 'subscriptions' && <Subscriptions data={data} subscriptions={insights.subscriptions} nav={nav} />}
        {page === 'savings' && <Savings data={data} savings={insights.savings} nav={nav} />}
        {page === 'review' && <Review data={data} flags={insights.flags} />}
        {page === 'audit' && <Audit data={data} />}
        {page === 'settings' && <Settings data={data} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-muted">
        Your statements and transactions are stored only in this browser. There is no server.{' '}
        {smartSorting === 'on'
          ? 'Smart sorting is on: only shop names (never amounts, dates or account details) are sent to OpenRouter, with your own key.'
          : 'Smart sorting is off: nothing leaves this device.'}{' '}
        ·{' '}
        <a href={privacyHref} className="underline">
          What we send
        </a>
      </footer>
    </div>,
  )
}

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#1c5cab" />
      <path d="M6 15.5l3.5-4 3 2.5L18 8" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
