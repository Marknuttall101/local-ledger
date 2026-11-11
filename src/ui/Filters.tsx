import { useEffect, useRef, useState } from 'react'
import { monthOf, monthsBetween } from '../core/analytics'
import { monthShort } from './format'

// ---- Period

export type Period = { kind: 'last'; months: number } | { kind: 'all' } | { kind: 'custom'; from: string; to: string }

/** Inclusive date bounds (YYYY-MM-DD) for a period; `latest` is the newest transaction date */
export function periodBounds(p: Period, latest: string): { from?: string; to?: string } {
  if (p.kind === 'all') return {}
  if (p.kind === 'custom') {
    const [y, m] = p.to.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { from: `${p.from}-01`, to: `${p.to}-${String(lastDay).padStart(2, '0')}` }
  }
  const from = new Date(latest)
  from.setUTCMonth(from.getUTCMonth() - p.months)
  from.setUTCDate(from.getUTCDate() + 1)
  return { from: from.toISOString().slice(0, 10) }
}

export const inPeriod = (date: string, b: { from?: string; to?: string }) => (!b.from || date >= b.from) && (!b.to || date <= b.to)

export function PeriodPicker({ value, onChange, first, last }: { value: Period; onChange: (p: Period) => void; first?: string; last?: string }) {
  const months = first && last ? monthsBetween(monthOf(first), monthOf(last)).reverse() : []
  const custom = value.kind === 'custom'
  const startCustom = () => {
    if (!months.length) return
    onChange({ kind: 'custom', from: months[Math.min(2, months.length - 1)], to: months[0] })
  }
  const isLast = (n: number) => value.kind === 'last' && value.months === n
  const tab = (active: boolean) => `rounded-lg px-3 py-1 ${active ? 'bg-black/[0.07] font-medium' : 'text-ink-2'}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-xl border border-black/10 bg-surface p-0.5 text-sm">
        {[3, 6, 12].map((n) => (
          <button key={n} onClick={() => onChange({ kind: 'last', months: n })} className={tab(isLast(n))}>
            {n} months
          </button>
        ))}
        <button onClick={() => onChange({ kind: 'all' })} className={tab(value.kind === 'all')}>
          All
        </button>
        <button onClick={startCustom} className={tab(custom)}>
          Choose months
        </button>
      </div>
      {value.kind === 'custom' && (
        <span className="flex items-center gap-1.5 text-sm">
          <select
            aria-label="From month"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value, to: e.target.value > value.to ? e.target.value : value.to })}
            className="rounded-lg border border-black/15 bg-surface px-2 py-1"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthShort(m)}
              </option>
            ))}
          </select>
          <span className="text-ink-2">to</span>
          <select
            aria-label="To month"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value, from: e.target.value < value.from ? e.target.value : value.from })}
            className="rounded-lg border border-black/15 bg-surface px-2 py-1"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthShort(m)}
              </option>
            ))}
          </select>
        </span>
      )}
    </div>
  )
}

// ---- Pick several from a list

export interface PickOption {
  id: string
  label: string
  /** Options with the same group are listed together under it */
  group?: string
}

/**
 * A dropdown of tick boxes. An empty selection means "everything", so new accounts or
 * categories are included automatically.
 */
export function MultiPicker({ noun, allLabel, options, value, onChange }: { noun: string; allLabel: string; options: PickOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
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

  const selected = new Set(value)
  const all = value.length === 0 || value.length === options.length
  const isOn = (id: string) => all || selected.has(id)
  const toggle = (id: string) => {
    const next = new Set(all ? options.map((o) => o.id) : value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Keep at least one ticked (an empty choice means "everything")
    if (!next.size) return
    onChange(next.size === options.length ? [] : [...next])
  }
  const setGroup = (group: string, on: boolean) => {
    const next = new Set(all ? options.map((o) => o.id) : value)
    for (const o of options) if (o.group === group) (on ? next.add(o.id) : next.delete(o.id))
    if (!next.size) return
    onChange(next.size === options.length ? [] : [...next])
  }
  const summary = all
    ? allLabel
    : value.length === 1
      ? (options.find((o) => o.id === value[0])?.label ?? `1 ${noun}`)
      : `${value.length} of ${options.length} ${noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`}`

  const groups = [...new Set(options.map((o) => o.group ?? ''))]
  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${all ? 'border-black/10 bg-surface' : 'border-brand/40 bg-brand-soft/50 font-medium text-brand'}`}
        aria-expanded={open}
      >
        {summary}
        <span aria-hidden className="text-xs text-muted">
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 max-h-96 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-black/10 bg-surface p-2 shadow-lg">
          <div className="mb-1 flex justify-between px-2 text-xs text-muted">
            <span>Tick the ones to include</span>
            <button className="text-brand hover:underline" onClick={() => onChange([])}>
              Select all
            </button>
          </div>
          {groups.map((g) => {
            const items = options.filter((o) => (o.group ?? '') === g)
            const groupOn = items.every((o) => isOn(o.id))
            return (
              <div key={g}>
                {g && (
                  <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-black/[0.04]">
                    <input type="checkbox" checked={groupOn} onChange={() => setGroup(g, !groupOn)} />
                    {g}
                  </label>
                )}
                {items.map((o) => (
                  <div key={o.id} className={`group flex items-center rounded-lg pr-2 hover:bg-black/[0.04] ${g ? 'pl-4' : ''}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1 text-sm">
                      <input type="checkbox" checked={isOn(o.id)} onChange={() => toggle(o.id)} />
                      <span className="truncate">{o.label}</span>
                    </label>
                    <button className="text-xs text-brand hover:underline focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => onChange([o.id])}>
                      only
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
