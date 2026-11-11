import type { ParsedStatement } from '../types'

/** One piece of text on a PDF page with its position (PDF units, y grows upwards) */
export interface PdfItem {
  str: string
  x: number
  y: number
  width: number
  page: number
}

export type ReaderInput =
  | { kind: 'pdf'; fileName: string; items: PdfItem[]; text: string }
  | { kind: 'csv'; fileName: string; rows: string[][] }

export interface BankReader {
  id: string
  bank: string
  /** 0 = not this format, 1 = certainly this format */
  detect(input: ReaderInput): number
  read(input: ReaderInput): ParsedStatement
}
