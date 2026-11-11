import { useState } from 'react'
import { UNCATEGORISED } from '../core/categories'
import { addCategory } from '../services/actions'
import { Button, Dot, Modal } from './components'
import type { AppData } from './useAppData'

const NEW = '__new'

export function CategorySelect({
  data,
  value,
  onChange,
  allowAll,
  highlight,
  className = '',
}: {
  data: AppData
  value: string
  onChange: (id: string) => void
  allowAll?: boolean
  highlight?: boolean
  className?: string
}) {
  const [creating, setCreating] = useState(false)
  const color = data.groupById.get(data.categoryById.get(value)?.groupId ?? '')?.color
  return (
    <span className={`relative inline-flex items-center rounded-lg border bg-surface text-sm ${highlight ? 'border-warn' : 'border-black/10'} ${className}`}>
      {color && !allowAll && (
        <span className="pointer-events-none absolute left-2.5">
          <Dot color={color} />
        </span>
      )}
      <select
        value={value}
        onChange={(e) => (e.target.value === NEW ? setCreating(true) : onChange(e.target.value))}
        className={`max-w-52 appearance-none bg-transparent py-1 pr-7 ${color && !allowAll ? 'pl-7' : 'pl-3'}`}
        aria-label="Category"
      >
        {allowAll && <option value="">All categories</option>}
        {data.groups.map((g) => (
          <optgroup key={g.id} label={g.name}>
            {data.categories
              .filter((c) => c.groupId === g.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
        {!allowAll && <option value={NEW}>+ New category…</option>}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-xs text-muted">▾</span>
      {creating && (
        <NewCategory
          data={data}
          groupId={data.categoryById.get(value)?.groupId}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            onChange(id)
          }}
        />
      )}
    </span>
  )
}

/** Add a category without leaving the page, then pick it */
function NewCategory({ data, groupId, onCancel, onCreated }: { data: AppData; groupId?: string; onCancel: () => void; onCreated: (id: string) => void }) {
  // Start in the group of the current category, unless that's the catch-all "Other" group
  const otherGroup = data.categoryById.get(UNCATEGORISED)?.groupId
  const [group, setGroup] = useState(groupId && groupId !== otherGroup ? groupId : (data.groups.find((g) => g.id !== otherGroup) ?? data.groups[0]).id)
  const [name, setName] = useState('')
  const [hint, setHint] = useState('')
  const [saving, setSaving] = useState(false)
  const taken = data.categories.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())

  const save = async () => {
    if (!name.trim() || taken) return
    setSaving(true)
    try {
      onCreated((await addCategory(group, name, hint)).id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onCancel}>
      <h2 className="text-lg font-semibold">New category</h2>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="block text-sm font-medium">
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Concert tickets" className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 font-normal" />
        </label>
        {taken && <p className="text-sm text-bad">There's already a category called that.</p>}
        <label className="block text-sm font-medium">
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="mt-1 w-full rounded-xl border border-black/15 bg-surface px-3 py-2 font-normal">
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          What goes in it? <span className="font-normal text-muted">(optional)</span>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. concert tickets, and refunds for them"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 font-normal"
          />
        </label>
        <p className="text-xs text-muted">The description helps the AI decide which shops belong here.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button kind="primary" type="submit" disabled={saving || !name.trim() || taken}>
            Add and use it
          </Button>
        </div>
      </form>
    </Modal>
  )
}
