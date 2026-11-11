/**
 * The user's own OpenRouter API key ("bring your own key").
 *
 * Where it lives:
 * - By default in sessionStorage: this tab only, gone when the tab is closed.
 * - In localStorage only if the user ticks "Remember on this device".
 *
 * It is deliberately NOT kept in the app's IndexedDB database, because Settings → "Download a
 * backup" exports that database to a file, and a key must never end up in a backup.
 *
 * The key is only ever sent to openrouter.ai, in the Authorization header (see openrouter.ts).
 * The page's Content-Security-Policy (index.html) blocks connections to any other site.
 */

const STORAGE_KEY = 'local-ledger.openrouter-key'

function read(store: () => Storage): string | undefined {
  try {
    return store().getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function write(store: () => Storage, value: string | undefined) {
  try {
    if (value === undefined) store().removeItem(STORAGE_KEY)
    else store().setItem(STORAGE_KEY, value)
  } catch {
    // Storage blocked (private window, site data off): the key just won't be kept
  }
}

const session = () => window.sessionStorage
const local = () => window.localStorage

type Listener = () => void
const listeners = new Set<Listener>()

/** Re-render when the key changes */
export function onApiKeyChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getApiKey(): string | undefined {
  return read(session) ?? read(local)
}

export function isKeyRemembered(): boolean {
  return read(local) !== undefined
}

/** OpenRouter keys start with "sk-or-"; reject anything else before it's ever sent */
export function looksLikeOpenRouterKey(key: string): boolean {
  return /^sk-or-[A-Za-z0-9_-]{20,200}$/.test(key.trim())
}

export function setApiKey(key: string, remember: boolean) {
  const k = key.trim()
  if (!looksLikeOpenRouterKey(k)) throw new Error('That doesn’t look like an OpenRouter key (they start with "sk-or-").')
  clearApiKey()
  write(remember ? local : session, k)
  listeners.forEach((fn) => fn())
}

export function clearApiKey() {
  write(session, undefined)
  write(local, undefined)
  listeners.forEach((fn) => fn())
}
