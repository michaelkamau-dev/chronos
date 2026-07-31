/**
 * Boots Ledger and measures the rendered surface.
 *
 * The era's central claim is that tone is an ordered dither and never an alpha blend,
 * and that claim is not judgeable by eye — a downscaled screenshot of a 25% Bayer tile
 * averages into a flat colour and looked *green* the first time it was reviewed. So this
 * samples pixels and counts them: a bare patch of desktop must contain exactly two
 * values, in exactly the ratio the matrix predicts.
 *
 * `test/browser/ledger-fidelity.spec.ts` asserts the same thing as a gate. This exists
 * for the times you want to look at the era and get a number at the same time.
 *
 *   node tools/shots/ledger-render.mjs [out.png]
 *
 * Needs a dev server on 5174 (`npx vite --port 5174 --strictPort`).
 */

import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'ledger.png'
const CHROMIUM = process.env.CHRONOS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const URL = process.env.CHRONOS_URL ?? 'http://127.0.0.1:5174'

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--font-render-hinting=none'],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
const failed = []
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
})
page.on('pageerror', (e) => failed.push(`pageerror ${e.message}`))

await page.goto(`${URL}/?era=ledger`)
await page.waitForFunction(() => window.__chronos !== undefined, null, { timeout: 20000 })
await page.evaluate(() => document.fonts.ready)
await page.evaluate(() => window.__chronos.openWindows(2))
// Long enough for the suspension policy to fire on the windows that lost focus, so the
// capture shows the bleach rather than three identical frames.
await page.waitForTimeout(2200)
writeFileSync(OUT, await page.screenshot())

const report = await page.evaluate(() => {
  const win = document.querySelector('[data-win-id]')
  const root = document.getElementById('chronos-root')
  return {
    era: window.__chronos.era,
    faceLoaded: document.fonts.check('900 18px "Public Sans Ledger"'),
    titleBarHeight: win?.querySelector('[data-part="titlebar"]')?.getBoundingClientRect().height,
    gutterWidth: win?.querySelector('[data-ledger-gutter]')?.getBoundingClientRect().width,
    titleCost: win?.querySelector('[data-ledger-cost]')?.textContent,
    gutterEntries: [...(win?.querySelectorAll('[data-ledger-entry]') ?? [])].map(
      (e) => e.textContent,
    ),
    sessionTotal: document.querySelector('[data-ledger-total]')?.textContent,
    band: document.querySelector('[data-ledger-band]')?.getAttribute('data-ledger-band'),
    suspended: window.__chronos.shell.wm.list().filter((s) => s.suspended).length,
    regions: [...document.querySelectorAll('[data-shell-region]')].map(
      (r) => r.dataset.shellRegion,
    ),
    displayScale: window.__chronos.shell.display.scale(),
  }
})

/** A bare patch of desktop, counted rather than looked at. */
const box = await page.evaluate(() => {
  const d = document.querySelector('[data-desktop]').getBoundingClientRect()
  return { x: Math.round(d.x + 60), y: Math.round(d.y + d.height - 200), width: 48, height: 48 }
})
const patch = await page.screenshot({ clip: box })
const tone = await page.evaluate(async (bytes) => {
  const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const x = c.getContext('2d')
  x.drawImage(bmp, 0, 0)
  const d = x.getImageData(0, 0, bmp.width, bmp.height).data
  const seen = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const k = `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const total = [...seen.values()].reduce((a, b) => a + b, 0)
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex, n]) => ({ hex, n, share: +(n / total).toFixed(4) }))
}, [...patch])

console.log(JSON.stringify({ ...report, desktopTone: tone, httpFailures: failed }, null, 2))
console.log(
  tone.length === 2
    ? `\nDesktop is two inks, ${(tone[1].share * 100).toFixed(1)}% carbon — ordered dither, no alpha.`
    : `\nWARNING: desktop shows ${tone.length} values. An ordered dither has exactly two.`,
)
console.log(`wrote ${OUT}`)
await browser.close()
