import type { ReactNode } from 'react'
import { Logo } from './App'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-ink-2">{children}</div>
    </section>
  )
}

/**
 * Plain statement of where data goes. Every claim here is checkable in the source:
 * - storage: src/db/db.ts (IndexedDB) and src/services/apiKey.ts (the key)
 * - network: src/services/openrouter.ts, the only code that makes requests to another site
 * - enforcement: the Content-Security-Policy in index.html (connect-src 'self' https://openrouter.ai)
 */
export function PrivacyPolicy() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-5 font-semibold tracking-tight">
        <a href="#" className="flex items-center gap-2">
          <Logo /> Local Ledger
        </a>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="text-3xl font-semibold tracking-tight">What Local Ledger sends, and to whom</h1>
        <p className="mt-4 text-ink-2">
          Local Ledger runs entirely in your browser. It has no server, no accounts, no analytics and no cookies. The site that hosts it only delivers the
          app's files; it never receives your statements or anything the app works out.
        </p>

        <Section title="Stored in this browser only">
          <ul className="list-disc space-y-1 pl-5">
            <li>your statement files, which are read in the browser and never uploaded;</li>
            <li>every transaction: its date, amount, the bank's original wording, the cleaned-up shop name and category;</li>
            <li>your name, address, balances, BSB and account or card numbers, if your statement shows them;</li>
            <li>your categories, corrections, renamed shops and answers about unusual charges.</li>
          </ul>
          <p>
            All of this lives in the browser's own database (IndexedDB) on this device. Clearing your browsing data removes it, so Settings → Your data lets you
            download a backup file and restore it later.
          </p>
        </Section>

        <Section title="Sent to OpenRouter — only if you turn on smart sorting">
          <p>
            Smart sorting is off until you choose to turn it on, and it needs your own OpenRouter API key. With it on, for each shop the app doesn't already
            recognise, your browser sends OpenRouter:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>the cleaned-up shop name, for example "Fernquist Goods", with numbers removed;</li>
            <li>the town or state the bank printed after the shop, if any, for example "NSW";</li>
            <li>your list of category names and their descriptions, so the AI can choose one.</li>
          </ul>
          <p>
            Each shop is sent once. Shops the app already recognises, and payments that may name a person (bank transfers, Osko, PayID, Beem), are never sent. No
            amounts, dates, balances or account details are sent. The request goes straight from your browser to openrouter.ai and is answered by TypeSafe AI's
            Jev model; OpenRouter's and the model provider's own terms apply to what they receive.
          </p>
        </Section>

        <Section title="Your OpenRouter key">
          <p>
            The key is kept in your browser's session storage, so it's forgotten when you close the tab, or in local storage if you tick "Remember on this
            device". It is sent only to openrouter.ai, to sign your requests. It's never put in backup files and never sent anywhere else. Use a key with a
            spending limit, and remove it any time from Settings → Privacy.
          </p>
        </Section>

        <Section title="How you can check this">
          <p>
            The page's Content-Security-Policy only allows connections to the site itself and to openrouter.ai, so the browser blocks the page's own requests to
            anywhere else. You can see it in the page source, and every request in your browser's developer tools (Network tab).
          </p>
        </Section>

        <p className="mt-10">
          <a href="#" className="text-brand hover:underline">
            ← Back to Local Ledger
          </a>
        </p>
      </main>
    </div>
  )
}
