import { useRef, useState } from 'react'
import { restoreBackup } from '../services/actions'
import { Logo } from './App'
import { Button, PrivacyNote, Spinner } from './components'
import { privacyHref } from './routes'

export function Landing({ onFiles, onSample, loadingSample }: { onFiles: (f: FileList) => void; onSample?: () => void; loadingSample: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const [restoreError, setRestoreError] = useState('')
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-5 font-semibold tracking-tight">
        <Logo /> Local Ledger
        <a href={privacyHref} className="ml-auto text-sm font-normal text-brand hover:underline">
          What we send
        </a>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 text-center sm:pt-12">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">See where your money really goes.</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-2">
          Drop in a bank statement. In seconds you'll see your spending by category, every subscription you're paying for, and where you could save.
        </p>

        <button
          onClick={() => input.current?.click()}
          className="group mt-10 flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-brand/40 bg-surface px-6 py-14 transition-colors hover:border-brand hover:bg-brand-soft/30"
        >
          <svg viewBox="0 0 24 24" className="size-12 text-brand" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
          </svg>
          <span className="mt-4 text-xl font-medium">Drop a bank statement here</span>
          <span className="mt-1 text-ink-2">PDF or CSV · or click to choose a file</span>
        </button>
        <input ref={input} type="file" accept=".pdf,.csv,.txt" multiple className="sr-only" onChange={(e) => e.target.files && onFiles(e.target.files)} />
        <PrivacyNote className="mt-4" />
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
          Used Local Ledger here before and your spending's gone? Browsers sometimes clear saved data (Safari does after 7 days without a visit).{' '}
          <button className="text-brand hover:underline" onClick={() => restoreInput.current?.click()}>
            Restore a backup file
          </button>
          .
        </p>
        <input
          ref={restoreInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              await restoreBackup(f)
            } catch (err) {
              setRestoreError((err as Error).message)
            }
          }}
        />
        {restoreError && <p className="mt-2 text-sm text-bad">{restoreError}</p>}

        {onSample && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <span className="text-sm text-muted">Not ready to use your own?</span>
            <Button onClick={onSample} disabled={loadingSample} size="lg">
              {loadingSample ? <Spinner /> : null}
              Try it with example data
            </Button>
          </div>
        )}

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            ['Your statement stays with you', 'Your statement is read inside your browser. The file, your balances and your account numbers never leave this device.'],
            ['No account, no server', 'No sign-up, no bank login, no card number. Everything is stored in this browser; there is no server that could keep a copy.'],
            ['Finds forgotten costs', 'Spot the subscriptions you forgot about, fees you did not need to pay, and charges that look wrong.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-black/10 bg-surface p-5">
              <div className="font-medium">{t}</div>
              <div className="mt-1 text-sm text-ink-2">{d}</div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted">
          Works with Westpac PDF statements and CSV downloads from CommBank, Westpac, ANZ, NAB and most other banks.
        </p>
      </main>
    </div>
  )
}
