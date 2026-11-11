import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { GROUP_PALETTE, INCOME_CATEGORY, TRANSFER_CATEGORY, UNCATEGORISED } from '../core/categories'
import { db } from '../db/db'
import { addCategory, addGroup, deleteAllData, deleteCategory, exportBackup, importsNewestFirst, removeImport, renameAccount, restoreBackup, updateCategory, updateGroup } from '../services/actions'
import { getApiKey } from '../services/apiKey'
import { createAiClassifier, getSmartSorting, setSmartSorting } from '../services/classifier'
import { recheckUnsureShops, refreshCategories, unsureShops } from '../services/importer'
import type { Category, ImportRecord } from '../core/types'
import { ApiKeyForm, useHasApiKey } from './ApiKey'
import { privacyHref } from './routes'
import { isDataKept } from '../services/storage'
import { useStoredState } from './state'
import { FindMatches } from './FindMatches'
import { Badge, Button, Card, Dot, Modal, PageTitle } from './components'
import { dateLabel, plural } from './format'
import type { AppData } from './useAppData'

type Tab = 'categories' | 'data' | 'privacy'

export function Settings({ data }: { data: AppData }) {
  const [tab, setTab] = useStoredState<Tab>('settings.tab', 'categories')
  return (
    <div>
      <PageTitle title="Settings" />
      <div className="mb-6 inline-flex rounded-xl border border-black/10 bg-surface p-0.5 text-sm">
        {(
          [
            ['categories', 'Categories'],
            ['data', 'Your data'],
            ['privacy', 'Privacy'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-1.5 ${tab === id ? 'bg-black/[0.07] font-medium' : 'text-ink-2'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'categories' && <Categories data={data} />}
      {tab === 'data' && <DataTab data={data} />}
      {tab === 'privacy' && (
        <div className="space-y-4">
          <SmartSortingSetting />
          <Privacy />
        </div>
      )}
    </div>
  )
}

const LOCKED = new Set([UNCATEGORISED, TRANSFER_CATEGORY, INCOME_CATEGORY])

function Categories({ data }: { data: AppData }) {
  const [adding, setAdding] = useState<string | undefined>()
  const [newName, setNewName] = useState('')
  const [newHint, setNewHint] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [finding, setFinding] = useState<{ category: Category; isNew: boolean } | undefined>()
  const counts = new Map<string, number>()
  for (const t of data.transactions) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)

  const saveNew = async (groupId: string) => {
    if (!newName.trim()) return
    const category = await addCategory(groupId, newName, newHint)
    setNewName('')
    setNewHint('')
    setAdding(undefined)
    if (data.transactions.length && !data.isSample) setFinding({ category, isNew: true })
  }

  return (
    <div>
      <p className="mb-4 text-ink-2">
        Rename, add or remove categories. Changes apply to all your transactions straight away. Hover over a category and click <strong>Find shops</strong> to
        have the AI suggest shops that belong in it.
      </p>
      {finding && <FindMatches category={finding.category} isNew={finding.isNew} data={data} onClose={() => setFinding(undefined)} />}
      <div className="grid gap-4 md:grid-cols-2">
        {data.groups.map((g) => (
          <Card key={g.id}>
            <div className="mb-3 flex items-center gap-2">
              <Dot color={g.color} />
              <InlineEdit value={g.name} onSave={(name) => updateGroup(g.id, { name })} className="font-semibold" />
            </div>
            <ul className="space-y-1">
              {data.categories
                .filter((c) => c.groupId === g.id)
                .map((c) => (
                  <li key={c.id} className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-black/[0.03]">
                    <InlineEdit value={c.name} onSave={(name) => updateCategory(c.id, { name })} disabled={LOCKED.has(c.id)} />
                    <span className="flex items-center gap-2">
                      {!LOCKED.has(c.id) && data.transactions.length > 0 && (
                        <button className="text-xs text-brand hover:underline sm:hidden sm:group-hover:block" onClick={() => setFinding({ category: c, isNew: false })}>
                          Find shops
                        </button>
                      )}
                      <span className="text-xs text-muted">{counts.get(c.id) ?? 0}</span>
                      <select
                        value={c.groupId}
                        onChange={(e) => updateCategory(c.id, { groupId: e.target.value })}
                        className="hidden rounded border border-black/10 bg-surface text-xs group-hover:block"
                        aria-label="Move to group"
                      >
                        {data.groups.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      {!LOCKED.has(c.id) && (
                        <button
                          className="hidden text-muted hover:text-bad group-hover:block"
                          title="Delete category"
                          onClick={() => {
                            if (window.confirm(`Delete “${c.name}”? Its ${counts.get(c.id) ?? 0} transactions will become Uncategorised.`)) deleteCategory(c.id)
                          }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
            {adding === g.id ? (
              <form
                className="mt-2 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveNew(g.id)
                }}
              >
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name, e.g. Pottery" aria-label="Category name" className="w-full rounded-lg border border-black/15 px-2 py-1 text-sm" />
                <input
                  value={newHint}
                  onChange={(e) => setNewHint(e.target.value)}
                  placeholder="What goes in it? e.g. pottery classes, studios, clay supplies"
                  aria-label="What goes in this category"
                  className="w-full rounded-lg border border-black/15 px-2 py-1 text-sm"
                />
                <p className="text-xs text-muted">The description helps the AI decide which shops belong here.</p>
                <div className="flex gap-2">
                  <Button size="sm" kind="primary" type="submit">
                    Add
                  </Button>
                  <Button size="sm" kind="ghost" type="button" onClick={() => setAdding(undefined)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button size="sm" kind="ghost" className="mt-2" onClick={() => setAdding(g.id)}>
                + Add category
              </Button>
            )}
          </Card>
        ))}
        <Card className="border-dashed">
          <div className="mb-2 font-semibold">New group</div>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newGroup.trim()) return
              const used = new Set(data.groups.map((g) => g.color))
              await addGroup(newGroup, GROUP_PALETTE.find((c) => !used.has(c)) ?? '#898781')
              setNewGroup('')
            }}
          >
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Business" className="flex-1 rounded-lg border border-black/15 px-2 py-1 text-sm" />
            <Button size="sm" type="submit">
              Add group
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}

function InlineEdit({ value, onSave, disabled, className = '' }: { value: string; onSave: (v: string) => void; disabled?: boolean; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  if (disabled) return <span className={className}>{value}</span>
  if (!editing) {
    return (
      <button className={`text-left hover:underline ${className}`} onClick={() => setEditing(true)} title="Rename">
        {value}
      </button>
    )
  }
  const commit = () => {
    setEditing(false)
    if (v.trim() && v.trim() !== value) onSave(v.trim())
    else setV(value)
  }
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setV(value)
          setEditing(false)
        }
      }}
      className={`rounded border border-brand px-1 ${className}`}
    />
  )
}

function DataTab({ data }: { data: AppData }) {
  const imports = useLiveQuery(importsNewestFirst, []) ?? []
  const corrections = useLiveQuery(() => db.corrections.toArray(), []) ?? []
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState<ImportRecord | undefined>()
  const [message, setMessage] = useState('')
  const hasKey = useHasApiKey()
  const smart = useLiveQuery(getSmartSorting, []) === 'on'
  const [kept, setKept] = useState<boolean>()
  const restoreInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    isDataKept().then(setKept)
  }, [])

  const download = async () => {
    const blob = await exportBackup()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `local-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const aiSorted = data.transactions.filter((t) => t.categorySource === 'ai').length
  const aiCorrections = corrections.filter((c) => c.aiSource === 'ai' && c.aiCategoryId !== c.userCategoryId).length

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">Accounts & files</h2>
        <p className="mt-1 text-sm text-ink-2">
          Stored only in this browser on this device.
        </p>
        <ul className="mt-3 divide-y divide-black/5 text-sm">
          {data.accounts.map((a) => (
            <li key={a.id} className="py-2">
              <AccountName id={a.id} bank={a.bank} label={a.label} suffix={a.suffix} />
              <ul className="text-xs text-muted">
                {imports
                  .filter((i) => i.accountId === a.id)
                  .map((i) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <span>{`${i.fileName} (${plural(i.added, 'new transaction')}${i.skippedDuplicates ? `, ${i.skippedDuplicates} already had` : ''}) · ${dateLabel(i.at.slice(0, 10))}`}</span>
                      <button className="text-bad hover:underline" onClick={() => setRemoving(i)}>
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Backup</h2>
        <p className="mt-1 text-sm text-ink-2">
          Your data lives only in this browser. If you clear your browsing data or switch computers it will be gone, so download a backup to keep a copy. A
          backup file holds your transactions and settings; it never includes your OpenRouter key.
        </p>
        {kept === false && (
          <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            This browser may clear this app's data if you don't visit for a while (Safari does this after 7 days). Download a backup after each audit so you don't have
            to upload your statements again.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={download}>Download backup</Button>
          <Button onClick={() => restoreInput.current?.click()}>Restore a backup</Button>
          <input
            ref={restoreInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                await restoreBackup(f)
                setMessage('Backup restored.')
              } catch (err) {
                setMessage((err as Error).message)
              }
            }}
          />
        </div>
        {message && <p className="mt-2 text-sm text-ink-2">{message}</p>}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">How well is the AI doing?</h2>
        <p className="mt-1 text-sm text-ink-2">
          {smart ? (
            <>
              Smart sorting:{' '}
              {hasKey ? <Badge tone="good">On, using your OpenRouter key</Badge> : <Badge tone="warn">On, but no OpenRouter key yet — add one in the Privacy tab</Badge>}
            </>
          ) : (
            'Smart sorting is off, so shops are sorted on this device with simple keyword guesses. You can turn it on in the Privacy tab.'
          )}
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {plural(aiSorted, 'transaction')} sorted by the AI · {plural(corrections.length, 'correction')} made by you
          {aiCorrections > 0 && ` · ${aiCorrections} of them fixed an AI guess`}. Every correction is remembered, so the same shop is never wrong twice.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {smart && hasKey && <Recheck />}
          <Button size="sm" kind="ghost" onClick={() => refreshCategories()}>
            Re-apply my rules to everything
          </Button>
        </div>
      </Card>

      <Card className="border-bad/30">
        <h2 className="text-lg font-semibold">Delete everything</h2>
        <p className="mt-1 text-sm text-ink-2">
          Removes all statements, transactions, categories and settings from this browser. This can't be undone.
        </p>
        <Button kind="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
          Delete all my data
        </Button>
      </Card>

      {removing && (
        <Modal onClose={() => setRemoving(undefined)}>
          <h2 className="text-lg font-semibold">Remove {removing.fileName}?</h2>
          <p className="mt-2 text-ink-2">
            This deletes the {plural(removing.added, 'transaction')} it added. Your categories and the corrections you've made
            stay, so you can upload the statement again straight away.
          </p>
          {removing.skippedDuplicates > 0 && (
            <p className="mt-2 text-sm text-ink-2">
              {plural(removing.skippedDuplicates, 'transaction')} in this file came from another statement you uploaded, and will stay.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setRemoving(undefined)}>Cancel</Button>
            <Button
              kind="danger"
              onClick={async () => {
                await removeImport(removing.id)
                setRemoving(undefined)
              }}
            >
              Remove statement
            </Button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)}>
          <h2 className="text-lg font-semibold">Delete all your data?</h2>
          <p className="mt-2 text-ink-2">
            Everything stored in this browser will be permanently removed. Consider downloading a backup first.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              kind="danger"
              onClick={async () => {
                await deleteAllData()
                setConfirmDelete(false)
              }}
            >
              Yes, delete everything
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Ask the AI about shops that haven't been sorted with confidence yet */
function Recheck() {
  const count = useLiveQuery(async () => (await unsureShops()).length, [])
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy'; done: number; total: number } | { kind: 'done'; text: string }>({ kind: 'idle' })
  if (state.kind === 'done') return <span className="self-center text-sm text-ink-2">{state.text}</span>
  if (!count) return null
  const run = async () => {
    setState({ kind: 'busy', done: 0, total: count })
    const key = getApiKey()
    if (!key) return
    let offline = false
    const result = await recheckUnsureShops(
      createAiClassifier(key, (s) => (offline ||= s === 'offline')),
      (done, total) => setState({ kind: 'busy', done, total }),
    )
    setState({
      kind: 'done',
      text: offline && !result.checked ? "OpenRouter couldn't be reached — nothing changed. Try again later." : `Re-checked ${plural(result.checked, 'shop')}; ${plural(result.changed, 'category', 'categories')} changed.`,
    })
  }
  return (
    <Button size="sm" onClick={run} disabled={state.kind === 'busy'} title="Asks the AI about each shop that hasn't been sorted with confidence yet">
      {state.kind === 'busy' ? `Re-checking… ${state.done} of ${state.total}` : `Sort ${plural(count, 'unsure shop')} with AI`}
    </Button>
  )
}

function AccountName({ id, bank, label, suffix }: { id: string; bank: string; label: string; suffix?: string }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(label)
  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          await renameAccount(id, name)
          setEditing(false)
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="rounded-lg border border-black/15 bg-surface px-2 py-1" aria-label="Account name" autoFocus />
        <Button size="sm" kind="primary" type="submit" disabled={!name.trim()}>
          Save
        </Button>
        <Button size="sm" kind="ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">
        {label}
        <span className="font-normal text-muted">
          {' '}
          · {bank}
          {suffix && ` ···${suffix}`}
        </span>
      </span>
      <button className="text-xs text-brand hover:underline" onClick={() => (setName(label), setEditing(true))}>
        Rename
      </button>
    </div>
  )
}

/** Smart sorting on or off: whether shop names may be sent to OpenRouter, with the user's own key */
function SmartSortingSetting() {
  const choice = useLiveQuery(getSmartSorting, [])
  const on = choice === 'on'
  const hasKey = useHasApiKey()
  const option = (value: 'off' | 'on', title: string, detail: string) => (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${on === (value === 'on') ? 'border-brand bg-brand-soft/30' : 'border-black/10'}`}>
      <input type="radio" name="smart-sorting" className="mt-1" checked={on === (value === 'on')} onChange={() => setSmartSorting(value)} />
      <span>
        <span className="font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-2">{detail}</span>
      </span>
    </label>
  )
  return (
    <Card className="max-w-4xl">
      <h2 className="text-lg font-semibold">Smart sorting</h2>
      <p className="mt-1 text-sm text-ink-2">Well-known shops are always recognised on this device. Smart sorting uses AI for the rest.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {option('off', 'Off — nothing is sent', "Shops we don't recognise get a quick guess on this device, and are left for you to check.")}
        {option(
          'on',
          'On — sort with AI',
          "Only the names of shops we don't recognise (and the town the bank listed) are sent to OpenRouter, using your own API key. Never amounts, dates or account details.",
        )}
      </div>
      {on && (
        <div className="mt-4 space-y-3">
          <ApiKeyForm />
          {hasKey && <Recheck />}
        </div>
      )}
    </Card>
  )
}

export function Privacy() {
  return (
    <Card className="max-w-4xl">
      <h2 className="text-lg font-semibold">Where your information goes</h2>
      <p className="mt-2 text-ink-2">Local Ledger has no server and no accounts. Everything it works out is stored in this browser.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-good-soft/60 p-4">
          <div className="font-medium text-good">Never leaves this browser</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Your statement files</li>
            <li>Every transaction: date, amount, the bank's original wording, category</li>
            <li>Your name, address, balances and account or card numbers</li>
            <li>Your categories, corrections and review answers</li>
            <li>Your OpenRouter key, except to OpenRouter itself, to sign your requests</li>
          </ul>
        </div>
        <div className="rounded-xl bg-black/[0.03] p-4">
          <div className="font-medium">Sent to OpenRouter — only if smart sorting is on</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>
              Cleaned-up shop names only — e.g. “Fernquist Goods” — with numbers removed, plus the town the bank listed. Shops we already recognise, and payments that
              may name a person, are never sent.
            </li>
            <li>Your list of category names and descriptions, so the AI can pick from them.</li>
          </ul>
          <p className="mt-2 text-xs text-muted">
            Requests go straight from this browser to OpenRouter, signed with your own key, and are answered by TypeSafe AI's Jev model. OpenRouter's and the model
            provider's own policies apply to what they receive. Never amounts, dates or account details.
          </p>
        </div>
      </div>
      <p className="mt-5 text-sm text-ink-2">
        More detail:{' '}
        <a href={privacyHref} target="_blank" className="text-brand underline">
          what Local Ledger sends, and to whom
        </a>
        .
      </p>
    </Card>
  )
}
