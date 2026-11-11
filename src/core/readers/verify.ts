import { parseMoney } from '../parse-utils'
import type { CheckResult, CsvMapping, ParsedTransaction } from '../types'
import { amountOf, bodyRows } from './csv'

const near = (a: number, b: number) => Math.abs(a - b) < 0.005
/** Share of steps that must add up: allows for the odd same-day reordering */
const ENOUGH = 0.95

/**
 * Check what we read against the bank's own numbers. With a running balance, each row's amount
 * must explain the change in balance from the row before (either way round: statements list
 * newest or oldest first, and cards may show the amount owed). Otherwise opening + all amounts
 * must equal the closing balance.
 */
export function checkStatement(rows: string[][], mapping: CsvMapping, transactions: ParsedTransaction[], totals: { opening?: number; closing?: number } = {}): CheckResult {
  if (mapping.balanceColumn !== undefined) {
    const steps = bodyRows(rows, mapping)
      .map((r) => ({ amount: amountOf(r, mapping), balance: parseMoney(r[mapping.balanceColumn!] ?? '') }))
      .filter((s): s is { amount: number; balance: number } => s.amount !== undefined && s.amount !== 0 && s.balance !== undefined)
    if (steps.length >= 3) {
      const checked = steps.length - 1
      let best = 0
      for (const listed of [1, -1]) {
        for (const owed of [1, -1]) {
          let matched = 0
          for (let i = 1; i < steps.length; i++) {
            const [earlier, later] = listed === 1 ? [steps[i - 1], steps[i]] : [steps[i], steps[i - 1]]
            if (near(earlier.balance + owed * later.amount, later.balance)) matched++
          }
          best = Math.max(best, matched)
        }
      }
      return { status: best / checked >= ENOUGH ? 'balanced' : 'mismatch', method: 'running-balance', matched: best, checked }
    }
  }
  if (totals.opening !== undefined && totals.closing !== undefined && transactions.length) {
    const sum = transactions.reduce((s, t) => s + t.amount, 0)
    const ok = near(totals.opening + sum, totals.closing) || near(totals.opening - sum, totals.closing)
    return { status: ok ? 'balanced' : 'mismatch', method: 'totals', matched: ok ? 1 : 0, checked: 1 }
  }
  return { status: 'unchecked', matched: 0, checked: 0 }
}
