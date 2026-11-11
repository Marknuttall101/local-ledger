export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

export type SortColumns<T> = Record<string, (item: T) => string | number>

/** A sorted copy. Text sorts A–Z ignoring case; ties keep their original order. */
export function sortBy<T>(items: T[], sort: SortState, columns: SortColumns<T>): T[] {
  const value = columns[sort.key]
  if (!value) return items
  const sign = sort.dir === 'asc' ? 1 : -1
  return items
    .map((item, i) => ({ item, i, v: value(item) }))
    .sort((a, b) => {
      const c = typeof a.v === 'string' && typeof b.v === 'string' ? a.v.localeCompare(b.v, 'en-AU', { sensitivity: 'base' }) : Number(a.v) - Number(b.v)
      return c * sign || a.i - b.i
    })
    .map((x) => x.item)
}

/** Clicking a column: first click sorts it the natural way, a second click flips it */
export function nextSort(current: SortState, key: string, firstDir: SortState['dir'] = 'desc'): SortState {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }
}
