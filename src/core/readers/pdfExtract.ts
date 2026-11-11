import type { PdfItem } from './types'

/** The small part of the pdf.js API we use, so browser and test code can share this */
interface PdfJsLike {
  getDocument(src: { data: Uint8Array; [key: string]: unknown }): { promise: Promise<PdfDocLike> }
}
interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number }> }>
  }>
  destroy?(): Promise<void>
}

export class ScannedPdfError extends Error {
  constructor() {
    super('This PDF has no readable text (it may be a scanned image).')
  }
}

/** Pull every piece of text and its position out of a PDF. Runs locally; nothing is uploaded. */
export async function extractPdfItems(pdfjs: PdfJsLike, data: Uint8Array): Promise<{ items: PdfItem[]; text: string }> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const items: PdfItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    for (const raw of content.items) {
      if (!raw.str || !raw.transform) continue
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width ?? 0, page: p })
    }
  }
  await doc.destroy?.()
  if (!items.some((i) => i.str.trim())) throw new ScannedPdfError()
  return { items, text: items.map((i) => i.str).join('\n') }
}
