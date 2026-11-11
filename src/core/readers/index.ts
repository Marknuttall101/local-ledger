import { csvPresetReaders } from './csv'
import type { BankReader, ReaderInput } from './types'
import { westpacPdfReader } from './westpacPdf'

export const READERS: BankReader[] = [westpacPdfReader, ...csvPresetReaders]

/** The dedicated reader that best recognises this file, if any */
export function pickReader(input: ReaderInput): BankReader | undefined {
  let best: BankReader | undefined
  let bestScore = 0.5
  for (const r of READERS) {
    const score = r.detect(input)
    if (score > bestScore) {
      best = r
      bestScore = score
    }
  }
  return best
}
