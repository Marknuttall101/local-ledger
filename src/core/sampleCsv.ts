import { generateSampleStatements } from './sampleData'

/**
 * The made-up example year as a bank-style CSV download (Date, Description, Debit, Credit), so the
 * real import path can be tried without a real statement. Written to examples/; a test keeps the
 * committed file in step with this function (UPDATE_EXAMPLES=1 npx vitest run sampleCsv to rewrite).
 */
export function sampleCsv(account: 'everyday' | 'card'): string {
  const [everyday, card] = generateSampleStatements()
  const statement = account === 'card' ? card : everyday
  const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  const cell = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = [...statement.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => [ddmmyyyy(t.date), cell(t.rawDescription), t.amount < 0 ? (-t.amount).toFixed(2) : '', t.amount > 0 ? t.amount.toFixed(2) : ''].join(','))
  return ['Date,Description,Debit,Credit', ...rows].join('\n') + '\n'
}
