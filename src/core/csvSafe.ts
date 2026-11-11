/**
 * One CSV cell, quoted, and safe to open in a spreadsheet. Bank wording and shop names come from
 * statements, so a cell starting with = + - @ (or a tab or carriage return) could be run as a
 * formula by Excel or Sheets. Such cells get a leading apostrophe, which spreadsheets show as text.
 * Plain numbers such as "-12.50" are left alone so amounts stay numbers.
 */
export function csvCell(value: unknown): string {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
