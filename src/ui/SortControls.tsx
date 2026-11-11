import { nextSort, type SortState } from './sort'

/** A table column heading that sorts the table when clicked */
export function SortHeader({
  label,
  k,
  sort,
  onSort,
  firstDir = 'desc',
  className = '',
}: {
  label: string
  k: string
  sort: SortState
  onSort: (s: SortState) => void
  /** Which way the first click sorts: 'desc' for amounts and dates (biggest/newest first), 'asc' for names */
  firstDir?: SortState['dir']
  className?: string
}) {
  const active = sort.key === k
  return (
    <th className={`font-medium ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`} onClick={() => onSort(nextSort(sort, k, firstDir))}>
        {label}
        <span className={active ? '' : 'opacity-0'} aria-hidden>
          {active && sort.dir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  )
}

export interface SortChoice {
  label: string
  sort: SortState
}

/** "Sort: Newest first ▾" for lists that aren't laid out as tables */
export function SortPicker({ choices, value, onChange }: { choices: SortChoice[]; value: SortState; onChange: (s: SortState) => void }) {
  const index = Math.max(
    0,
    choices.findIndex((c) => c.sort.key === value.key && c.sort.dir === value.dir),
  )
  return (
    <label className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-surface px-3 py-1.5 text-sm text-ink-2">
      Sort
      <select value={index} onChange={(e) => onChange(choices[Number(e.target.value)].sort)} className="bg-transparent font-medium text-ink" aria-label="Sort by">
        {choices.map((c, i) => (
          <option key={c.label} value={i}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  )
}
