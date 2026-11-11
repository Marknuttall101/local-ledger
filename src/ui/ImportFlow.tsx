import { useEffect, useMemo, useRef, useState } from 'react'
import { finishStatement } from '../core/readers/generic'
import type { Account, CheckResult, CsvMapping, DateFormat, ParsedStatement, StatementInfo } from '../core/types'

const NEW_ACCOUNT = '__new__'
import { chosenClassifier } from '../services/classifier'
import { analyseFile, commitStatement, suggestAccount, type FileAnalysis, type ImportProgress } from '../services/importer'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Badge, Button, Modal, PrivacyNote, Spinner } from './components'
import { dateLabel, money, plural, shortDate } from './format'

type Step =
  | { kind: 'analysing' }
  | { kind: 'preview'; analysis: Extract<FileAnalysis, { status: 'recognised' }> }
  | { kind: 'mapping'; rows: string[][]; mapping: CsvMapping; info: StatementInfo }
  | { kind: 'saving'; progress: ImportProgress; ai?: 'ai' | 'offline'; local?: boolean }
  | { kind: 'error'; message: string }

export interface Done {
  fileName: string
  added: number
  duplicates: number
}

export function ImportFlow({
  files,
  replacingSample,
  beforeSave,
  onFinished,
  onCancel,
}: {
  files: File[]
  replacingSample: boolean
  beforeSave: () => Promise<void>
  onFinished: (results: Done[]) => void
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState<Step>({ kind: 'analysing' })
  const [done, setDone] = useState<Done[]>([])
  const file = files[index]
  const cleared = useRef(false)
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []

  useEffect(() => {
    if (!file) return
    let cancelled = false
    setStep({ kind: 'analysing' })
    analyseFile(file).then((a) => {
      if (cancelled) return
      if (a.status === 'recognised') setStep({ kind: 'preview', analysis: a })
      else if (a.status === 'needs-mapping') setStep({ kind: 'mapping', rows: a.rows, mapping: a.mapping, info: a.info ?? { kind: 'csv', fileName: file.name } })
      else setStep({ kind: 'error', message: a.message })
    })
    return () => {
      cancelled = true
    }
  }, [file])

  // Files dropped while a statement is still saving join the queue, so check the latest list
  const latestFiles = useRef(files)
  latestFiles.current = files

  const next = (result?: Done) => {
    const all = result ? [...done, result] : done
    setDone(all)
    if (index + 1 < latestFiles.current.length) setIndex(index + 1)
    else if (all.length) onFinished(all)
    else onCancel()
  }

  const saving = useRef(false)
  const save = async (statement: ParsedStatement, mapping?: CsvMapping, accountId?: string, label?: string) => {
    // Ignore a second click while this file is already being saved
    if (saving.current) return
    saving.current = true
    if (replacingSample && !cleared.current) {
      cleared.current = true
      await beforeSave()
    }
    let ai: 'ai' | 'offline' | undefined
    setStep({ kind: 'saving', progress: { phase: 'saving' } })
    const classifier = await chosenClassifier((s) => (ai = s))
    const local = classifier.name === 'fallback'
    const summary = await commitStatement(statement, file.name, classifier, {
      mapping,
      accountId,
      label,
      onProgress: (progress) => setStep({ kind: 'saving', progress, ai, local }),
    })
    saving.current = false
    next({ fileName: file.name, added: summary.added, duplicates: summary.duplicates })
  }

  if (!file) return null
  const fileLabel = files.length > 1 ? `File ${index + 1} of ${files.length}: ${file.name}` : file.name

  return (
    <Modal wide={step.kind === 'preview' || step.kind === 'mapping'} onClose={step.kind === 'saving' ? undefined : onCancel}>
      <div className="mb-4 truncate text-sm text-muted">{fileLabel}</div>

      {step.kind === 'analysing' && (
        <div className="flex flex-col items-center py-10 text-center">
          <Spinner />
          <div className="mt-3 font-medium">Reading your statement…</div>
          <PrivacyNote className="mt-2" />
        </div>
      )}

      {step.kind === 'error' && (
        <div className="py-4">
          <div className="text-lg font-semibold">We couldn't read this one</div>
          <p className="mt-2 text-ink-2">{step.message}</p>
          <div className="mt-6 flex justify-end">
            <Button kind="primary" onClick={() => next()}>
              {index + 1 < files.length ? 'Skip to next file' : 'OK'}
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'preview' && (
        <Preview
          statement={step.analysis.statement}
          canFix={!!step.analysis.rows}
          accounts={replacingSample ? [] : accounts}
          onConfirm={(accountId, label) => save(step.analysis.statement, step.analysis.mapping, accountId, label)}
          onFix={() =>
            step.analysis.rows &&
            step.analysis.mapping &&
            setStep({ kind: 'mapping', rows: step.analysis.rows, mapping: step.analysis.mapping, info: step.analysis.info ?? { kind: 'csv', fileName: file.name } })
          }
          onCancel={() => next()}
        />
      )}

      {step.kind === 'mapping' && (
        <ColumnMapper
          rows={step.rows}
          initial={step.mapping}
          info={step.info}
          onDone={(mapping) =>
            setStep({
              kind: 'preview',
              analysis: { status: 'recognised', fileName: file.name, statement: finishStatement(step.rows, mapping, step.info, `${step.info.kind}-mapped`), rows: step.rows, mapping, info: step.info },
            })
          }
          onCancel={() => next()}
        />
      )}

      {step.kind === 'saving' && <Saving progress={step.progress} ai={step.ai} local={step.local} />}
    </Modal>
  )
}

function Preview({
  statement,
  canFix,
  accounts,
  onConfirm,
  onFix,
  onCancel,
}: {
  statement: ParsedStatement
  canFix: boolean
  accounts: Account[]
  onConfirm: (accountId?: string, label?: string) => void
  onFix: () => void
  onCancel: () => void
}) {
  const [accountId, setAccountId] = useState(() => suggestAccount(statement, accounts) ?? NEW_ACCOUNT)
  const [label, setLabel] = useState('')
  const txs = statement.transactions
  const dates = txs.map((t) => t.date).sort()
  const out = txs.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)
  const inn = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const [showWarnings, setShowWarnings] = useState(false)

  if (!txs.length) {
    return (
      <div>
        <div className="text-lg font-semibold">Nothing to add from this one</div>
        <p className="mt-2 text-ink-2">{statement.bank} {statement.accountLabel}{statement.accountSuffix ? ` ···${statement.accountSuffix}` : ''} has no transactions in this statement's date range, so there's nothing to add. If you expected some, check you downloaded the right account and dates.</p>
        <div className="mt-6 flex justify-end gap-2">
          {canFix && <Button onClick={onFix}>Choose the columns myself</Button>}
          <Button kind="primary" onClick={onCancel}>
            OK
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {statement.check?.status === 'mismatch' ? <Badge tone="warn">Please check</Badge> : <Badge tone="good">{statement.check?.status === 'balanced' ? '✓ Checked' : '✓ Recognised'}</Badge>}
        <span className="text-sm text-ink-2">{statement.bank}</span>
      </div>
      <h2 className="mt-2 text-xl font-semibold">
        {statement.accountLabel}
        {statement.accountSuffix && <span className="font-normal text-muted"> ···{statement.accountSuffix}</span>}
      </h2>
      <p className="mt-1 text-ink-2">
        {plural(txs.length, 'transaction')} · {dateLabel(dates[0])} – {dateLabel(dates[dates.length - 1])}
      </p>
      <CheckNote check={statement.check} />
      {accounts.length > 0 && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-2">Which account is this?</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-lg border border-black/15 bg-surface px-2 py-1">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.bank}
                {a.suffix ? ` ···${a.suffix}` : ''} (already added)
              </option>
            ))}
            <option value={NEW_ACCOUNT}>A new account</option>
          </select>
          {accountId !== NEW_ACCOUNT && <span className="text-xs text-muted">Transactions you've already added will be skipped.</span>}
        </label>
      )}
      {accountId === NEW_ACCOUNT && (
        <label className="mt-3 block text-sm">
          <span className="text-ink-2">Name this account</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder={`e.g. Business bank, My Visa — or leave blank for “${statement.accountLabel}”`}
            className="mt-1 w-full rounded-lg border border-black/15 bg-surface px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-muted">This name is how Local Ledger tells your accounts apart. We never keep full account numbers.</span>
        </label>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-black/[0.03] p-3">
          <div className="text-ink-2">Money out</div>
          <div className="tabular text-lg font-semibold">{money(out)}</div>
        </div>
        <div className="rounded-xl bg-black/[0.03] p-3">
          <div className="text-ink-2">Money in</div>
          <div className="tabular text-lg font-semibold">{money(inn)}</div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-black/10">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-20" />
            <col />
            <col className="w-28" />
          </colgroup>
          <thead className="bg-black/[0.03] text-left text-xs font-medium text-ink-2">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {txs.slice(0, 6).map((t, i) => (
              <tr key={i} className="border-b border-black/5 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-ink-2">{shortDate(t.date)}</td>
                <td className="truncate px-3 py-2" title={t.rawDescription}>{t.rawDescription}</td>
                <td className={`tabular whitespace-nowrap px-3 py-2 text-right ${t.amount > 0 ? 'text-good' : ''}`}>{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length > 6 && <div className="bg-black/[0.02] px-3 py-1.5 text-xs text-muted">…and {plural(txs.length - 6, 'more row')}</div>}
      </div>

      {statement.warnings.length > 0 && (
        <div className="mt-3 text-sm">
          <button className="text-warn underline" onClick={() => setShowWarnings(!showWarnings)}>
            {plural(statement.warnings.length, 'row')} couldn't be read
          </button>
          {showWarnings && (
            <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5 text-ink-2">
              {statement.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {canFix && (
            <Button kind="ghost" onClick={onFix}>
              Something's wrong — fix columns
            </Button>
          )}
          <Button kind="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <Button kind="primary" size="lg" onClick={() => (accountId === NEW_ACCOUNT ? onConfirm(undefined, label) : onConfirm(accountId))} autoFocus>
          Looks right →
        </Button>
      </div>
    </div>
  )
}

/** Tells the user how sure we are that the amounts were read correctly */
function CheckNote({ check }: { check?: CheckResult }) {
  if (!check || check.status === 'unchecked') {
    return check ? (
      <p className="mt-2 text-sm text-ink-2">This statement doesn't show balances, so we couldn't double-check every amount. Have a quick look at the rows below.</p>
    ) : null
  }
  if (check.status === 'balanced') {
    return (
      <p className="mt-2 text-sm text-good">
        {check.method === 'running-balance' ? 'Every amount adds up with the bank’s running balance.' : 'The amounts add up to the statement’s closing balance.'}
      </p>
    )
  }
  return (
    <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      {check.method === 'running-balance'
        ? `${check.checked - check.matched} of ${check.checked} amounts don't match the bank’s running balance — some rows may have been read wrongly.`
        : 'The amounts don’t add up to the statement’s closing balance — some rows may have been read wrongly.'}{' '}
      Use “fix columns” below to check.
    </p>
  )
}

type Role = 'ignore' | 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance'
const ROLE_LABELS: Record<Role, string> = {
  ignore: '—',
  date: 'Date',
  description: 'Description',
  amount: 'Amount (+/−)',
  debit: 'Money out',
  credit: 'Money in',
  balance: 'Balance (to check amounts)',
}

function ColumnMapper({ rows, initial, info, onDone, onCancel }: { rows: string[][]; initial: CsvMapping; info: StatementInfo; onDone: (m: CsvMapping) => void; onCancel: () => void }) {
  const [m, setM] = useState<CsvMapping>(initial)
  const cols = Math.max(...rows.slice(0, 20).map((r) => r.length))
  const roleOf = (c: number): Role =>
    c === m.dateColumn ? 'date' : c === m.descriptionColumn ? 'description' : c === m.amountColumn ? 'amount' : c === m.debitColumn ? 'debit' : c === m.creditColumn ? 'credit' : c === m.balanceColumn ? 'balance' : 'ignore'

  const setRole = (c: number, role: Role) => {
    const next: CsvMapping = { ...m }
    // A column has one role; a role belongs to one column
    for (const k of ['dateColumn', 'descriptionColumn', 'amountColumn', 'debitColumn', 'creditColumn', 'balanceColumn'] as const) if (next[k] === c) delete next[k]
    if (role === 'date') next.dateColumn = c
    if (role === 'description') next.descriptionColumn = c
    if (role === 'amount') {
      next.amountColumn = c
      delete next.debitColumn
      delete next.creditColumn
    }
    if (role === 'balance') next.balanceColumn = c
    if (role === 'debit' || role === 'credit') {
      delete next.amountColumn
      next[role === 'debit' ? 'debitColumn' : 'creditColumn'] = c
    }
    setM(next)
  }

  const result = useMemo(() => {
    const ready = m.dateColumn !== undefined && m.dateColumn >= 0 && m.descriptionColumn >= 0 && (m.amountColumn !== undefined || m.debitColumn !== undefined || m.creditColumn !== undefined)
    return ready ? finishStatement(rows, m, info) : undefined
  }, [m, rows, info])

  const shown = rows.slice(0, 7)
  return (
    <div>
      <h2 className="text-xl font-semibold">Which column is which?</h2>
      <p className="mt-1 text-ink-2">We haven't seen this layout before. We've made our best guess — check it once and we'll remember it for next time. If there's a Balance column, pick it too and we'll check every amount adds up.</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-black/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black/[0.03]">
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="px-2 py-2 text-left font-normal">
                  <select
                    value={roleOf(c)}
                    onChange={(e) => setRole(c, e.target.value as Role)}
                    className={`w-full rounded-lg border px-2 py-1 ${roleOf(c) === 'ignore' ? 'border-black/10 text-muted' : 'border-brand bg-brand-soft/40 font-medium'}`}
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={`border-t border-black/5 ${i === 0 && m.hasHeader ? 'bg-black/[0.02] text-muted' : ''}`}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="max-w-48 truncate whitespace-nowrap px-3 py-1.5">
                    {r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={m.hasHeader} onChange={(e) => setM({ ...m, hasHeader: e.target.checked })} />
          The first row is column titles
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={m.invertAmounts} onChange={(e) => setM({ ...m, invertAmounts: e.target.checked })} />
          Spending is shown as positive numbers
        </label>
        <label className="flex items-center gap-2">
          Dates are
          <select value={m.dateFormat} onChange={(e) => setM({ ...m, dateFormat: e.target.value as DateFormat })} className="rounded-lg border border-black/15 px-2 py-1">
            <option value="DMY">day/month/year</option>
            <option value="MDY">month/day/year</option>
            <option value="YMD">year-month-day</option>
          </select>
        </label>
        <div className="flex gap-2">
          <input className="w-1/2 rounded-lg border border-black/15 px-2 py-1" value={m.bank} onChange={(e) => setM({ ...m, bank: e.target.value })} placeholder="Bank" aria-label="Bank name" />
          <input className="w-1/2 rounded-lg border border-black/15 px-2 py-1" value={m.accountLabel} onChange={(e) => setM({ ...m, accountLabel: e.target.value })} placeholder="Account name" aria-label="Account name" />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-black/[0.03] p-3 text-sm">
        {result ? (
          <>
            <strong>{plural(result.transactions.length, 'transaction')}</strong> read
            {result.warnings.length > 0 && <span className="text-warn"> · {plural(result.warnings.length, 'row')} couldn't be read</span>}
            {result.check?.status === 'balanced' && <span className="text-good"> · ✓ adds up with the balances</span>}
            {result.check?.status === 'mismatch' && <span className="text-warn"> · doesn't add up with the balances — try another column or tick “Spending is shown as positive numbers”</span>}
            {result.transactions[0] && (
              <span className="text-ink-2">
                {' '}
                · e.g. {shortDate(result.transactions[0].date)} “{result.transactions[0].rawDescription}” {money(result.transactions[0].amount)}
              </span>
            )}
          </>
        ) : (
          <span className="text-ink-2">Pick the Date, Description and Amount columns.</span>
        )}
      </div>

      <div className="mt-6 flex justify-between gap-3">
        <Button kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button kind="primary" size="lg" disabled={!result?.transactions.length} onClick={() => onDone(m)}>
          Looks right →
        </Button>
      </div>
    </div>
  )
}

function Saving({ progress, ai, local }: { progress: ImportProgress; ai?: 'ai' | 'offline'; local?: boolean }) {
  const pct = progress.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : progress.phase === 'saving' ? 10 : 60
  return (
    <div className="py-8 text-center">
      <div className="text-lg font-semibold">{progress.phase === 'saving' ? 'Saving to this device…' : 'Sorting your spending into categories…'}</div>
      <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-sm text-ink-2">
        {progress.total ? `${progress.done} of ${plural(progress.total, 'new shop')} checked` : 'Recognising shops you use…'}
        {ai === 'offline' && !local && ' · using offline mode'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {local ? 'Sorted on this device — nothing is sent.' : 'Smart sorting is on: only shop names are checked — never amounts, dates or account details.'}
      </p>
    </div>
  )
}
