// End-to-end check and README screenshots, using made-up data only.
//
// Serves the production build (so the Content-Security-Policy is active), then in headless Chrome:
// loads the built-in example data, captures the main screens, imports examples/*.csv through the
// real file picker, and fails if the browser reports any error or CSP violation.
//
// Usage: npm run build && npm run screenshots        (needs Google Chrome installed)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const problems = []

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`console error: ${m.text()}`))
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`))
  // Nothing may leave the page except to itself (and OpenRouter, which this run never uses)
  page.on('request', (r) => {
    const origin = new URL(r.url()).origin
    if (origin !== new URL(base).origin && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`unexpected request: ${r.url()}`)
  })

  await page.goto(base)
  await page.getByText('See where your money really goes.').waitFor()

  await page.getByRole('button', { name: 'Try it with example data' }).click()
  await page.getByText('example data', { exact: false }).first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(800) // let the charts finish animating
  await page.mouse.move(0, 0) // no hover tooltips in the picture
  await page.screenshot({ path: `${OUT}/dashboard.png` })

  const tab = (name) => page.locator('header nav').getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await tab('Subscriptions')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/subscriptions.png` })

  await tab('Ways to save')
  await page.getByRole('heading', { name: /Ways to save/ }).first().waitFor()

  await tab('Settings')
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await page.getByText('Where your information goes').waitFor()
  await page.screenshot({ path: `${OUT}/privacy.png`, fullPage: true })

  // The real import path, with the example CSVs
  await page.getByRole('button', { name: 'Clear example' }).click()
  await page.getByText('See where your money really goes.').waitFor()
  await page.locator('main input[type=file][accept*=".csv"]').setInputFiles(['examples/sample-everyday-account.csv', 'examples/sample-credit-card.csv'])
  for (let i = 0; i < 2; i++) {
    const confirm = page.getByRole('button', { name: /Looks right/ })
    await confirm.waitFor({ timeout: 60_000 })
    await confirm.click()
    if (i === 0) await page.getByText(/File 2 of 2/).waitFor({ timeout: 60_000 })
  }
  const added = page.getByText(/Added .* new transaction/)
  await added.waitFor({ timeout: 60_000 })
  console.log(await added.innerText())
} finally {
  await browser.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`No browser errors, no CSP violations, no outside requests. Screenshots in ${OUT}/`)
