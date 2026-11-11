import { useEffect, useState } from 'react'
import { clearApiKey, getApiKey, isKeyRemembered, looksLikeOpenRouterKey, onApiKeyChange, setApiKey } from '../services/apiKey'
import { checkKey } from '../services/openrouter'
import { Badge, Button, Spinner } from './components'

/** Whether a key is set (the key itself is never put in React state or shown) */
export function useHasApiKey(): boolean {
  const [has, setHas] = useState(() => Boolean(getApiKey()))
  useEffect(() => onApiKeyChange(() => setHas(Boolean(getApiKey()))), [])
  return has
}

type Check = { kind: 'idle' } | { kind: 'checking' } | { kind: 'error'; text: string }

/**
 * Enter, check and forget the user's own OpenRouter key. The key is checked with OpenRouter
 * (GET /api/v1/key) before it's saved, and only ever sent to openrouter.ai.
 */
export function ApiKeyForm({ onSaved }: { onSaved?: () => void }) {
  const has = useHasApiKey()
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(false)
  const [check, setCheck] = useState<Check>({ kind: 'idle' })
  const [info, setInfo] = useState<string>()

  const save = async () => {
    const key = value.trim()
    if (!looksLikeOpenRouterKey(key)) {
      setCheck({ kind: 'error', text: 'That doesn’t look like an OpenRouter key. They start with "sk-or-".' })
      return
    }
    setCheck({ kind: 'checking' })
    try {
      const r = await checkKey(key)
      if (!r.ok) {
        setCheck({ kind: 'error', text: r.reason === 'invalid' ? 'OpenRouter says that key isn’t valid.' : 'Couldn’t reach OpenRouter. Check your connection and try again.' })
        return
      }
      setApiKey(key, remember)
      setValue('')
      setCheck({ kind: 'idle' })
      setInfo(`${r.label ? `Key “${r.label}”` : 'Key'} saved${r.limit == null ? ' — it has no spending limit; consider setting one on openrouter.ai' : ` · spending limit US$${r.limit}`}.`)
      onSaved?.()
    } catch {
      setCheck({ kind: 'error', text: 'Couldn’t reach OpenRouter. Check your connection and try again.' })
    }
  }

  if (has) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="good">OpenRouter key set</Badge>
        <span className="text-ink-2">{isKeyRemembered() ? 'Remembered on this device.' : 'For this tab only — forgotten when you close it.'}</span>
        {info && <span className="text-ink-2">{info}</span>}
        <Button
          size="sm"
          kind="ghost"
          onClick={() => {
            clearApiKey()
            setInfo(undefined)
          }}
        >
          Forget key
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-or-…"
          aria-label="OpenRouter API key"
          className="min-w-64 flex-1 rounded-xl border border-black/10 bg-surface px-3 py-1.5 font-mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" kind="primary" disabled={!value.trim() || check.kind === 'checking'}>
          {check.kind === 'checking' && <Spinner />} Check and use key
        </Button>
      </div>
      <label className="flex items-center gap-2 text-ink-2">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device (otherwise it's forgotten when you close this tab)
      </label>
      {check.kind === 'error' && <span className="text-bad">{check.text}</span>}
      <span className="text-xs text-muted">
        Your key stays in this browser and is sent only to openrouter.ai. Use a key with a spending limit; you can create one at openrouter.ai/keys.
      </span>
    </form>
  )
}
