import type { PdfItem } from './types'

/** One made-up line of a PDF page: [x, text] pieces at height y (y grows upwards, as in PDFs) */
export function pdfLine(y: number, cells: Array<[number, string]>, page = 1): PdfItem[] {
  return cells.map(([x, str]) => ({ str, x, y, width: str.length * 4.5, page }))
}
