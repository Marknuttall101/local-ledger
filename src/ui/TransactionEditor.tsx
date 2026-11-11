import { useState } from 'react'
import type { Transaction } from '../core/types'
import { oddShopName } from '../core/categorise'
import { matchesKeyword, suggestKeyword } from '../core/keywords'
import { changeCategory, renameByKeyword, renameMerchant } from '../services/actions'
import { Button, Modal, Spinner } from './components'
import { dateLabel, money, plural, sourceLabel } from './format'
import { CategorySelect } from './CategorySelect'
import type { AppData } from './useAppData'

/** Edit anything about a transaction: the shop's name, and its category (this one or the whole shop) */
export function TransactionEditor({ data, transaction: t, onClose }: { data: AppData; transaction: Transaction; onClose: () => void }) {
  const shopCount = data.transactions.filter((x) => x.merchantKey === t.merchantKey).length
  const [name, setName] = useState(t.merchant)
  const [categoryId, setCategoryId] = useState(t.categoryId)
  const [scope, setScope] = useState<'merchant' | 'one'>('merchant')
  const [saving, setSaving] = useState(false)
  const insight = data.insights.get(t.merchantKey)
  const account = data.accounts.find((a) => a.id === t.accountId)
  const nameChanged = name.trim() && name.trim() !== t.merchant
  const categoryChanged = categoryId !== t.categoryId
  // Rename by key word: every transaction whose bank wording contains it, whatever else is around it
  const [keyword, setKeyword] = useState(() => (t.rawDescription ? suggestKeyword(t.rawDescription) : ''))
  // Ticked to start with only when the name looks garbled, the case this is for: a short word like
  // "UBER" would otherwise merge different shops (Uber rides and Uber Eats) without being asked
  const [byKeyword, setByKeyword] = useState(() => Boolean(t.rawDescription && suggestKeyword(t.rawDescription) && oddShopName(t.merchant)))
  const matching = keyword.trim() ? data.transactions.filter((x) => x.rawDescription && matchesKeyword(x.rawDescription, keyword)) : []
  const keywordMatches = matching.length
  const mergedShops = [...new Set(matching.map((x) => x.merchant))]
  const useKeyword = byKeyword && keyword.trim() && keywordMatches > 0

  const save = async () => {
    setSaving(true)
    try {
      if (nameChanged) await (useKeyword ? renameByKeyword(keyword, name) : renameMerchant(t.merchantKey, name))
      if (categoryChanged) await changeCategory(t.id, categoryId, scope)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="text-sm text-muted">
        {dateLabel(t.date)} · {account ? `${account.label}${account.suffix ? ` ···${account.suffix}` : ''}` : ''}
      </div>
      <div className={`tabular mt-1 text-2xl font-semibold ${t.amount > 0 ? 'text-good' : ''}`}>{money(t.amount)}</div>
      <div className="mt-1 break-words text-xs text-muted">
        {t.rawDescription
          ? `On your statement: “${t.rawDescription}”${t.note ? ` · ${t.note}` : ''}`
          : "The bank's original wording is kept only in the browser where this statement was added."}
      </div>

      <label className="mt-5 block text-sm font-medium">Shop name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      {nameChanged && t.rawDescription ? (
        <div className="mt-2 rounded-xl bg-black/[0.03] p-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={byKeyword} onChange={(e) => setByKeyword(e.target.checked)} />
            <span>
              Also rename every transaction whose bank wording contains{' '}
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value.toUpperCase())}
                aria-label="Key word"
                className="w-32 rounded-md border border-black/15 px-1.5 py-0.5 font-mono text-xs uppercase"
              />
              <span className="mt-1 block text-xs text-muted">
                {keyword.trim()
                  ? `Matches ${plural(keywordMatches, 'transaction')} so far${mergedShops.length > 1 ? ` from ${plural(mergedShops.length, 'shop')}: ${mergedShops.slice(0, 5).join(', ')}${mergedShops.length > 5 ? '…' : ''}` : ''}, and future statements too. They become one shop and share its category.`
                  : 'Type a word from the bank wording above, e.g. the shop’s name.'}
              </span>
            </span>
          </label>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Renaming changes {shopCount > 1 ? `all ${plural(shopCount, 'transaction')}` : 'this transaction'} from this shop, and future statements. The category stays as it is.
        </p>
      )}

      <label className="mt-4 block text-sm font-medium">Category</label>
      <div className="mt-1">
        <CategorySelect data={data} value={categoryId} onChange={setCategoryId} className="w-full py-1" />
      </div>
      {categoryChanged && shopCount > 1 && (
        <div className="mt-2 space-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === 'merchant'} onChange={() => setScope('merchant')} />
            All {shopCount} from this shop, and future ones
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} />
            Just this one
          </label>
        </div>
      )}

      <div className="mt-5 rounded-xl bg-black/[0.03] p-3 text-sm text-ink-2">
        <div>
          How it was sorted: <strong className="text-ink">{sourceLabel(t)}</strong>
        </div>
        {insight && (
          <div className="mt-1">
            {insight.source === 'ai' ? 'The AI' : 'Offline guess'} suggested <strong className="text-ink">{data.categoryById.get(insight.categoryId)?.name ?? insight.categoryId}</strong> ({Math.round(insight.confidence * 100)}% sure)
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" onClick={save} disabled={saving || (!nameChanged && !categoryChanged)}>
          {saving && <Spinner />} Save
        </Button>
      </div>
    </Modal>
  )
}
