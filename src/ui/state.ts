import { useEffect, useState } from 'react'

/**
 * Page settings (filters, sort order, open tab) remembered in this browser, so they're still there
 * after switching tabs or reloading. A viewing preference, not data, so it isn't included in
 * backups. `override` replaces what was remembered, e.g. when another page links here with a filter.
 */
export function useStoredState<T>(key: string, initial: T, override?: T): [T, (v: T) => void] {
  const storageKey = `local-ledger.${key}`
  const [value, setValue] = useState<T>(() => {
    if (override !== undefined) return override
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Storage unavailable (private window): the setting just isn't remembered
    }
  }, [storageKey, value])
  return [value, setValue]
}
