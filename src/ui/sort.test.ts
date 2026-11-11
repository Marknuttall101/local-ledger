import { describe, expect, it } from 'vitest'
import { nextSort, sortBy } from './sort'

const rows = [
  { name: 'corner pantry', amount: -23, date: '2026-01-02' },
  { name: 'Bramblecup', amount: -140, date: '2026-01-05' },
  { name: 'Salary', amount: 2000, date: '2026-01-01' },
]
const columns = { name: (r: (typeof rows)[number]) => r.name, size: (r: (typeof rows)[number]) => Math.abs(r.amount), date: (r: (typeof rows)[number]) => r.date }

describe('sortBy', () => {
  it('sorts by size, date or name in either direction', () => {
    expect(sortBy(rows, { key: 'size', dir: 'desc' }, columns).map((r) => r.name)).toEqual(['Salary', 'Bramblecup', 'corner pantry'])
    expect(sortBy(rows, { key: 'date', dir: 'asc' }, columns).map((r) => r.name)).toEqual(['Salary', 'corner pantry', 'Bramblecup'])
    expect(sortBy(rows, { key: 'name', dir: 'asc' }, columns).map((r) => r.name)).toEqual(['Bramblecup', 'corner pantry', 'Salary'])
  })
  it('leaves the list alone for an unknown column', () => {
    expect(sortBy(rows, { key: 'nope', dir: 'asc' }, columns)).toBe(rows)
  })
  it('flips direction on a second click', () => {
    expect(nextSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' })
    expect(nextSort({ key: 'date', dir: 'desc' }, 'name', 'asc')).toEqual({ key: 'name', dir: 'asc' })
  })
})
