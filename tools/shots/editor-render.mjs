/**
 * Render the Editor in every era and save a shot of each.
 *
 * `CLAUDE.md`: verify against all six skins by rendering and looking. Files found
 * six bugs that way which every assertion had missed — chiefly a set of glyphs no
 * era face carries — so a script that only asserts is not the gate. This one exists
 * to produce the pictures a person then looks at, and it reports the two things a
 * person cannot see by looking: which characters the app renders that the era's own
 * face does not carry, and whether the content overflows its own frame.
 *
 * Usage: node tools/shots/editor-render.mjs [outDir]
 * Expects a dev server on 127.0.0.1:5174.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ERAS = ['winxp', 'win31', 'tiger', 'system1', 'macos8', 'ledger']
const BASE = 'http://127.0.0.1:5174'
const CHROMIUM = process.env['CHRONOS_CHROMIUM'] ?? '/opt/pw-browsers/chromium'
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const outDir = args[0] ?? 'tools/shots/out'

/**
 * Injected into the status bar when `--probe` is passed.
 *
 * A guard is only worth trusting once it has been seen to fail, and this one has
 * failed twice already in two different ways. U+25B8 is the exact character that
 * put grey pixels into a 1-bit window in the Files app; U+2014 is the one that took
 * a window title off the pixel grid. No era face in this project carries either.
 */
const PROBE_CHARS = ' ▸—'

mkdirSync(outDir, { recursive: true })

const probe = process.argv.includes('--probe')
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--font-render-hinting=none'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })

const BODY = [
  'The quick brown fox jumps over the lazy dog.',
  'Beta gamma delta beta epsilon.',
  'A line long enough to test whether word wrap folds it or the surface scrolls sideways instead.',
  '',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789',
].join('\n')

let failures = 0
/** Probe characters reported across all eras, for the self-check at the end. */
let probeReports = 0

for (const era of ERAS) {
  await page.goto(`${BASE}/?era=${era}`)
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.wipeStorage())
  await page.evaluate(() => window.__chronos.reset())

  const file = await page.evaluate(async (body) => {
    const fs = window.__chronos.fs
    return await fs.createFile(fs.root(), 'Sample.txt', body)
  }, BODY)
  await page.evaluate((f) => window.__chronos.openEditorWindow(f), file)
  await page.waitForSelector('[data-app="editor"] [data-ui="textarea"]')
  await page.locator('[data-app="editor"] [data-ui="textarea"]').click()
  // Open the replace bar so every control the app ships is in the picture, and
  // select a run so the era's selection ink is in it too.
  await page.keyboard.press('Control+h')
  await page.waitForSelector('[data-ui-role="findbar"]:not([hidden])')
  await page.keyboard.type('beta')
  await page.evaluate(() => {
    const el = document.querySelector('[data-app="editor"] [data-ui="textarea"]')
    el.focus()
    el.setSelectionRange(44, 54)
  })
  await page.waitForTimeout(120)

  const frame = page.locator('[data-app="editor"]').locator('xpath=ancestor::*[@data-win-id][1]')
  await frame.screenshot({ path: join(outDir, `editor-${era}.png`) })

  if (probe) {
    await page.evaluate((chars) => {
      document.querySelector('[data-app="editor"] [data-ui="statusbar"]').textContent += chars
    }, PROBE_CHARS)
  }

  const report = await page.evaluate(() => {
    const root = document.querySelector('[data-app="editor"]')

    /*
     * Every string paired with the face **that element** renders in.
     *
     * One face for the whole app is the version of this that cannot fail in the
     * interesting direction: the document surface and the status bar may be set in
     * different faces, and the character that goes missing is exactly the one in
     * the surface the check did not ask about.
     *
     * The *first* family only, never the computed shorthand — every skin's stack
     * ends in a generic, and a generic can draw anything.
     */
    const eraFace = (el) => {
      const cs = getComputedStyle(el)
      const first = cs.fontFamily.split(',')[0].trim()
      return `${cs.fontSize} ${first}`
    }

    const pairs = []
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent.trim()
          if (t) pairs.push([t, eraFace(node)])
        } else if (child.nodeType === Node.ELEMENT_NODE) walk(child)
      }
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        if (node.value) pairs.push([node.value, eraFace(node)])
      }
      if (node instanceof HTMLElement && node.title) pairs.push([node.title, eraFace(node)])
    }
    walk(root)

    /*
     * Coverage by **rasterising**, and neither of the two obvious instruments.
     *
     * `document.fonts.check()` is what `CLAUDE.md` names for this and it is the
     * wrong call: it answers "are the faces this text needs loaded", not "does this
     * face have this glyph". A character the era's face lacks is drawn by the
     * browser's default, which counts as available, so it returns true for every
     * character in every era and the guard cannot fail. Verified by injecting
     * U+25B8 and U+2014 and watching it report nothing.
     *
     * The advance width is the next thing to reach for and it is also wrong, in the
     * other direction: Pixel Operator Bold at 16px has the same advance as the
     * browser's default for two dozen ordinary Latin letters, so it reported `n`,
     * `o` and every digit missing in Windows 3.1 — false positives on characters
     * that plainly render.
     *
     * The bitmap discriminates, but only once **both renders fall back the same
     * way**. Comparing the era's face against a nonexistent family does not: a
     * missing *glyph* falls back through the system font list while a missing
     * *family* falls back to the default font, and the two can land on different
     * faces — which is why that version reported Windows 3.1 and Mac OS 8 clean
     * while the probe characters were sitting in their status bars. Appending the
     * same generic to both stacks makes the fallback identical by construction, so
     * equal pixels mean exactly one thing: the era's face drew nothing.
     */
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    /** The shared anchor both stacks end in, so any fallback is the same fallback. */
    const ANCHOR = 'monospace'

    const render = (ch, font) => {
      ctx.clearRect(0, 0, 64, 64)
      ctx.font = font
      ctx.fillStyle = '#000000'
      ctx.textBaseline = 'top'
      ctx.fillText(ch, 4, 4)
      return ctx.getImageData(0, 0, 64, 64).data
    }
    const identical = (a, b) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
      return true
    }

    const missing = []
    const seen = new Set()
    for (const [text, font] of pairs) {
      for (const c of new Set(text.split(''))) {
        if (c.trim().length === 0) continue
        const key = `${c} ${font}`
        if (seen.has(key)) continue
        seen.add(key)
        const [size2, ...family] = font.split(' ')
        const withFace = render(c, `${size2} ${family.join(' ')}, ${ANCHOR}`)
        const anchorOnly = render(c, `${size2} ${ANCHOR}`)
        if (identical(withFace, anchorOnly)) {
          missing.push({ char: c, code: c.codePointAt(0), font })
        }
      }
    }

    const surface = root.querySelector('[data-ui="textarea"]')
    const win = root.closest('[data-win-id]')
    const wr = win.getBoundingClientRect()
    const rr = root.getBoundingClientRect()
    const cs = getComputedStyle(surface)
    return {
      missing,
      overflow: { right: Math.round(rr.right - wr.right), bottom: Math.round(rr.bottom - wr.bottom) },
      face: cs.fontFamily,
      size: cs.fontSize,
      /** Visible lines of document, which is what a too-small default size costs. */
      lines: Math.floor(
        surface.clientHeight /
          // `line-height: normal` computes to the string, not a length, in most of
          // these skins, so the fallback is the era's own type size with the ratio
          // browsers use for `normal`.
          (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2),
      ),
    }
  })

  console.log(
    `${era.padEnd(8)} face=${report.face} size=${report.size} ` +
      `lines=${report.lines} overflow=${report.overflow.right}/${report.overflow.bottom} ` +
      `missing=${report.missing.length}`,
  )
  for (const m of report.missing) {
    console.log(`  MISSING U+${m.code.toString(16).toUpperCase().padStart(4, '0')} "${m.char}" in ${m.font}`)
  }
  if (report.missing.length > 0) failures++
  if (probe) probeReports += report.missing.filter((m) => PROBE_CHARS.includes(m.char)).length
  if (report.overflow.right > 0 || report.overflow.bottom > 0) {
    console.log(`  OVERFLOW the window frame`)
    failures++
  }
  if (report.lines < 4) {
    console.log(`  ONLY ${report.lines} visible lines of document`)
    failures++
  }
}

await browser.close()

if (probe) {
  /*
   * The probe must fail, but not everywhere, and the difference is the point.
   *
   * Only an era whose face actually lacks the character can report it. Measured:
   * ChiKareGo2 carries none of U+25B8, U+2014 or U+00B7, while Pixel Operator Bold
   * and the Chicago subset carry all three — so "every era reports" would be an
   * assertion about the fonts rather than about the instrument. What has to hold is
   * that the era known to be missing them says so.
   */
  console.log(probeReports >= 2 ? 'PROBE OK: the missing-glyph era reported' : 'PROBE FAILED')
  process.exit(probeReports >= 2 ? 0 : 1)
}
process.exit(failures === 0 ? 0 : 1)
