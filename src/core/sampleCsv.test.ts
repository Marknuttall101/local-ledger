import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { decide } from './readers/generic'
import { sampleCsv } from './sampleCsv'

const FILES = {
  everyday: 'examples/sample-everyday-account.csv',
  card: 'examples/sample-credit-card.csv',
} as const

describe.each(Object.entries(FILES) as Array<[keyof typeof FILES, string]>)('example CSV for the %s account', (account, path) => {
  it('matches the made-up example data (run with UPDATE_EXAMPLES=1 to rewrite it)', () => {
    const expected = sampleCsv(account)
    if (process.env.UPDATE_EXAMPLES) writeFileSync(path, expected)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(expected)
  })

  it('is read by the app without asking about columns, and every row is kept', () => {
    const rows = Papa.parse<string[]>(readFileSync(path, 'utf8').trim(), { skipEmptyLines: true }).data
    const d = decide(rows, { kind: 'csv', fileName: path })
    expect(d.status).toBe('recognised')
    if (d.status !== 'recognised') return
    expect(d.statement.warnings).toEqual([])
    expect(d.statement.transactions).toHaveLength(rows.length - 1)
  })
})
