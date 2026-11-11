import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import type { SavedView } from '../core/types'
import { db } from '../db/db'
import { deleteView, saveView } from '../services/actions'

/**
 * Save the page's current filters under a name ("Base spending") and switch back to them later.
 * Views are saved with the rest of your data, so they're included in backups.
 */
export function ViewsMenu<T>({ page, current, onApply }: { page: SavedView['page']; current: T; onApply: (state: T) => void }) {
  const views = useLiveQuery(() => db.views.where('page').equals(page).sortBy('name'), [page]) ?? []
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const now = JSON.stringify(current)
  const active = views.find((v) => v.state === now)
  const replacing = views.find((v) => v.name.toLowerCase() === name.trim().toLowerCase())

  const save = async () => {
    if (!name.trim()) return
    await saveView(page, name, current)
    setName('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${active ? 'border-brand/40 bg-brand-soft/50 font-medium text-brand' : 'border-black/10 bg-surface'}`}
        aria-expanded={open}
      >
        {active ? `View: ${active.name}` : 'Views'}
        <span aria-hidden className="text-xs text-muted">
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-black/10 bg-surface p-2 shadow-lg">
          {views.length === 0 ? (
            <p className="px-2 py-1 text-sm text-ink-2">No saved views yet. Set the filters the way you like, then save them here.</p>
          ) : (
            <ul>
              {views.map((v) => (
                <li key={v.id} className="group flex items-center rounded-lg pr-2 hover:bg-black/[0.04]">
                  <button
                    className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm ${v.id === active?.id ? 'font-medium text-brand' : ''}`}
                    onClick={() => {
                      try {
                        onApply(JSON.parse(v.state) as T)
                      } catch {
                        // A damaged view is left alone
                      }
                      setOpen(false)
                    }}
                  >
                    {v.id === active?.id ? '✓ ' : ''}
                    {v.name}
                  </button>
                  <button className="text-xs text-muted hover:text-bad focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => deleteView(v.id)} aria-label={`Delete view ${v.name}`}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-2 border-t border-black/5 px-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <label className="text-xs text-muted" htmlFor={`view-name-${page}`}>
              Save the current filters as
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`view-name-${page}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Base spending"
                maxLength={60}
                className="min-w-0 flex-1 rounded-lg border border-black/15 px-2 py-1 text-sm"
              />
              <button type="submit" disabled={!name.trim()} className="rounded-lg bg-brand px-3 py-1 text-sm font-medium text-white disabled:opacity-50">
                {replacing ? 'Replace' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
