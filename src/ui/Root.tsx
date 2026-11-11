import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { App } from './App'
import { Spinner } from './components'
import { PrivacyPolicy } from './PrivacyPolicy'
import { privacyHref } from './routes'

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function Root() {
  const hash = useHash()
  const [state, setState] = useState<'opening' | 'ready' | 'blocked'>('opening')

  useEffect(() => {
    db.open().then(
      () => setState('ready'),
      () => setState('blocked'),
    )
  }, [])

  if (hash === privacyHref) return <PrivacyPolicy />
  if (state === 'blocked') {
    return (
      <div className="mx-auto flex h-screen max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="text-lg font-semibold">This browser won't let Local Ledger save anything</div>
        <p className="text-ink-2">
          Local Ledger keeps your spending on this device, so it needs the browser's storage. This usually happens in a private window or when site data is
          blocked. Try a normal window, or allow site data for this site.
        </p>
      </div>
    )
  }
  if (state === 'opening') {
    return (
      <div className="flex h-screen items-center justify-center text-ink-2">
        <Spinner />
      </div>
    )
  }
  return <App />
}
