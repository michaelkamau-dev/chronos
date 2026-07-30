/**
 * Resolves the System 1 system font, and renders the comparison sheet CLAUDE.md
 * requires before any chrome is built on a substitute.
 *
 * System 1 needs **one** face for the whole era — Chicago 12, for the menu bar, menu
 * items, window titles, button labels and dialog text alike. Apple's Chicago is not
 * redistributable, so this ranks the reachable recreations against a target measured
 * from Apple's own figures rather than against a similarity judgement.
 *
 * The target is in `docs/eras/system1.md` and comes out of
 * `tools/pdf-extract/measure-mac-system1.py`: a 9px cap height, a 3px descender, a
 * 16px cell, per-glyph advances for fourteen letters, and ink widths for thirteen
 * strings the HIG figures actually contain.
 *
 * Three ways to fail, and the second is what disqualifies the best-licensed
 * candidate in the field:
 *
 * 1. **Wrong widths.** Measurable directly against the thirteen strings.
 * 2. **Not on the pixel grid.** A face whose coordinates are not integer multiples of
 *    `upm / 16` cannot render hard at 16px however well its widths match. Chicago 12
 *    is a bitmap, and a 1-bit era has no lighter black to hide antialiasing in — the
 *    same constraint that makes the disabled-text checkerboard load-bearing.
 * 3. **Cannot reach a 9px cap at an integer size.** A face on a different design cell
 *    steps its cap height 8, 10, 12 … with no size that yields 9.
 *
 * The sheet magnifies the 1x rasterisation rather than re-rendering larger, for the
 * same reason `build.mjs` does: a re-render at 64px shows a rasterisation that never
 * appears on screen.
 *
 *   node tools/font-compare/system1-chicago.mjs <fontDir> <outPng>
 *
 * `fontDir` must contain the candidate files named in CANDIDATES. They are not
 * committed — only the sheet and the accepted face are — so RESULTS below records
 * what each measured, and the verdicts stay reviewable without refetching four fonts.
 */

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FONT_DIR = resolve(process.argv[2] ?? 'fonts')
const OUT = resolve(process.argv[3] ?? 'docs/fonts/system1-font-chicago.png')
const CHROMIUM = process.env.CHRONOS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const ZOOM = 4
/** The era's one size. Chicago 12 is a 16px cell: ascent 12 + descent 3 + leading 1. */
export const SIZE_PX = 16

/**
 * Measured from the HIG figures. `advance` is per glyph in px; `ink` is the ink width
 * of a whole string, which is what a bitmap capture actually shows.
 */
export const TARGET = {
  capHeight: 9,
  descender: 3,
  cell: 16,
  advance: { N: 9, e: 8, O: 8, p: 8, C: 8, l: 4, S: 7, a: 8, v: 8, Q: 8, u: 8, i: 4, P: 8, r: 6 },
  ink: {
    'Modeless Dialog Box': 132,
    untitled: 50,
    Save: 29,
    Revert: 42,
    Quit: 24,
    Close: 33,
    'Open...': 43,
    New: 27,
    File: 21,
    Edit: 23,
    View: 30,
    Label: 33,
    Special: 44,
  },
}

export const CANDIDATES = [
  {
    name: 'ChiKareGo2',
    file: 'ChiKareGo2.ttf',
    author: 'Giles Booth',
    licence: 'Creative Commons — variant unconfirmed from this sandbox',
    accepted: true,
  },
  {
    name: 'Chicago Kare',
    file: 'ChicagoKare-Regular.ttf',
    author: 'Duane King',
    licence: 'repo LICENSE says MIT; the binary\'s nameID 13 says OFL',
  },
  {
    name: 'FA Sysfont C',
    file: 'sysfont.woff2',
    author: 'Alina Sava',
    licence: 'SIL OFL 1.1, declared in the binary with a deed URL',
  },
  {
    name: 'ChicagoFLF',
    file: 'ChicagoFLF.woff2',
    author: 'attributed to Robin Casady',
    licence: 'binary reads "(c)1990-92 Richard A. Ware. All Rights Reserved."',
  },
]

/**
 * What each candidate measured, on the pass that chose ChiKareGo2. Recorded here so
 * the verdicts survive without the four font files, in the same spirit as
 * `win31-system.mjs`.
 */
export const RESULTS = [
  {
    face: 'ChiKareGo2 (Giles Booth)',
    verdict: 'accept',
    capHeightAt16: 9,
    offGridCoords: '0 / 16172',
    offGridAdvances: 0,
    advanceMatches: '12 / 14',
    inkExact: '7 / 13',
    worstInkError: '+2px on a 132px string (+1.5%)',
    why:
      'The only candidate with every coordinate and every advance on the 64-unit '
      + 'pixel grid, so it renders with two tones and nothing between at 16px. Cap '
      + 'height exactly 9px, descender exactly 3px, ascent 12 + descent 3 — the '
      + 'Chicago 12 cell. Advances differ from Chicago 12 on two glyphs only: N is '
      + '10px against 9 and r is 7px against 6.',
  },
  {
    face: 'Chicago Kare (Duane King)',
    verdict: 'reject',
    capHeightAt16: 9,
    offGridCoords: '300 / 8892',
    offGridAdvances: 7,
    advanceMatches: '13 / 14',
    inkExact: '10 / 13',
    worstInkError: '+2px on a 132px string',
    why:
      'Matches the widths better than the accepted face and still loses, on two '
      + 'counts. Twenty-four glyphs are off the pixel grid, including the quote and '
      + 'apostrophe a window title will carry and — the reason it was a candidate at '
      + 'all — U+2713, whose advance is 11.11px. And its provenance is unstated: the '
      + 'README claims a faithful reproduction with no method, the repo LICENSE says '
      + 'MIT while the binary says OFL, the copyright record names Susan Kare, and '
      + 'the family name uses a typeface name Apple holds as a trade mark.',
  },
  {
    face: 'FA Sysfont C (Alina Sava)',
    verdict: 'reject',
    capHeightAt16: 10.672,
    offGridCoords: '6476 / 6804',
    offGridAdvances: 182,
    advanceMatches: '0 / 14',
    inkExact: '0 / 13',
    worstInkError: '+12.8px on a 132px string',
    why:
      'The best licence in the field — OFL 1.1 declared inside the binary with a '
      + 'deed URL, by the author whose W95FA this project already vetted — and the '
      + 'worst geometry. Drawn on a grid and then fitted to 1000 upm, so 95% of its '
      + 'coordinates and 182 of 188 advances are fractional at every integer size, '
      + 'and its cap height at 16px is 10.672px. Nothing about the licence can fix '
      + 'that, which is worth stating plainly: the best-licensed candidate is not '
      + 'automatically the shippable one.',
  },
  {
    face: 'ChicagoFLF (attributed to Robin Casady)',
    verdict: 'reject',
    capHeightAt16: 12,
    offGridCoords: 'n/a — 1000 upm outline revival',
    offGridAdvances: 'all',
    advanceMatches: '0 / 14',
    inkExact: '0 / 13',
    worstInkError: '+43.5px on a 132px string (+33%)',
    why:
      'Disqualified on its own copyright record. ARCHITECTURE.md §7 lists it as '
      + '"public domain per Robin Casady"; the binary\'s nameID 0 reads "4.1 '
      + '(c)1990-92 by Richard A. Ware. All Rights Reserved." — a different author '
      + 'and an explicit reservation. Separately it is the wrong lineage: an outline '
      + 'revival with a 750/1000 cap, 33% wider than Chicago 12 on every string.',
  },
]

function dataUri(file) {
  const buf = readFileSync(join(FONT_DIR, file))
  const kind = file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf'
  return `data:${kind};base64,${buf.toString('base64')}`
}

const SAMPLES = [
  'Modeless Dialog Box',
  'File Edit View Label Special',
  'Save As...  Revert  Quit',
  'untitled 2',
]

function buildHtml() {
  // Loaded through the FontFace API, not a CSS @font-face: canvas measureText and
  // fillText do not trigger a stylesheet font fetch, so every candidate would
  // silently fall back to one default and measure identically. That failure mode
  // published a comparison once already; see DECISIONS.md 3.8.
  const decls = CANDIDATES.map((c, i) => ({ family: `cand${i}`, uri: dataUri(c.file) }))
  const rows = CANDIDATES.map((c, i) => {
    const res = RESULTS.find((r) => r.face.startsWith(c.name)) ?? {}
    return `<tr>
      <th class="name">
        <div class="candname">${c.name}${c.accepted ? ' <span class="rec">accepted</span>' : ''}</div>
        <div class="who">${c.author}</div>
        <div class="lic">${c.licence}</div>
        <div class="metrics" data-metrics-for="cand${i}"></div>
        <div class="verdict ${res.verdict}">${(res.verdict ?? '').toUpperCase()}</div>
      </th>
      <td class="cell">
        ${SAMPLES.map(
          (t) =>
            `<canvas class="raster" data-font="cand${i}" data-text="${t.replace(/"/g, '&quot;')}"></canvas>`,
        ).join('')}
      </td>
      <td class="why">${res.why ?? ''}</td>
    </tr>`
  }).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { margin: 0; padding: 20px; background: #fff; color: #111;
  font: 13px/1.45 'DejaVu Sans', sans-serif; width: 1240px; }
h1 { font-size: 17px; margin: 0 0 4px; }
.spec { font-size: 12px; color: #444; margin: 0 0 10px; }
.target { font-size: 12px; margin: 0 0 10px; padding: 7px 10px; background: #e8f0fb;
  border-left: 3px solid #2f5d99; }
.note { font-size: 11px; color: #555; margin: 0 0 14px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d8d8d8; vertical-align: top; padding: 8px 10px; text-align: left; }
thead th { background: #f2f2f2; font-size: 11px; }
.name { width: 250px; background: #fafafa; }
.why { width: 430px; font-size: 11px; color: #333; }
.candname { font-size: 13px; font-weight: bold; }
.who { font-size: 10px; color: #444; margin-top: 1px; }
.rec { font-size: 10px; background: #cdebc5; color: #17400c; padding: 1px 5px; border-radius: 2px; }
.lic { font-size: 10px; color: #666; margin-top: 3px; }
.metrics { font-size: 10px; color: #222; margin-top: 6px;
  font-family: 'DejaVu Sans Mono', monospace; white-space: pre-line; }
.verdict { margin-top: 6px; font-size: 11px; font-weight: bold; padding: 2px 6px;
  display: inline-block; border-radius: 2px; }
.verdict.accept { background: #cdebc5; color: #17400c; }
.verdict.reject { background: #f6cfcf; color: #6b1111; }
canvas.raster { display: block; margin-bottom: 6px; image-rendering: pixelated; }
</style></head><body>
<h1>System 1 — Chicago 12 substitute, at the one size the era uses</h1>
<p class="spec">Chicago 12 is the whole era's face: menu bar, menu items, window
titles, button labels, dialog text. One face, one size.</p>
<p class="target"><b>Target</b>, measured from the Macintosh HIG's own 1-bit figures
(<code>tools/pdf-extract/measure-mac-system1.py</code>): cap height
<b>${TARGET.capHeight}px</b>, descender <b>${TARGET.descender}px</b>, a
<b>${TARGET.cell}px</b> cell, and the thirteen string ink widths listed in
<code>docs/eras/system1.md</code>.</p>
<p class="note">Each line is drawn once at <b>${SIZE_PX}px</b> and that bitmap is
upscaled ${ZOOM}x with smoothing off, so this is the real 1x rasterisation magnified.
<code>greys</code> counts distinct tones in the 1x raster: <b>2</b> means the face is
on the pixel grid and nothing is antialiased. Anything above 2 is soft text, which a
1-bit era cannot absorb.</p>
<table>
<thead><tr><th class="name">Candidate</th><th>Rendered at ${SIZE_PX}px, magnified ${ZOOM}x</th><th class="why">Verdict</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<script>
const FONTS = ${JSON.stringify(decls)};
const ZOOM = ${ZOOM};
const PX = ${SIZE_PX};
const TARGET = ${JSON.stringify(TARGET)};

function raster(font, text) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = PX + 'px "' + font + '"';
  const w = Math.ceil(probe.measureText(text).width) + 2;
  const h = PX + 6;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sc = src.getContext('2d');
  sc.fillStyle = '#fff'; sc.fillRect(0, 0, w, h);
  sc.fillStyle = '#000';
  sc.font = PX + 'px "' + font + '"';
  sc.textBaseline = 'alphabetic';
  sc.fillText(text, 1, PX);
  return { src, w, h };
}

function greyCount(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add(d[i]);
  return seen.size;
}

/** Ink width in px: first to last column containing any non-white pixel. */
function inkWidth(font, text) {
  const { src, w, h } = raster(font, text);
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  let lo = -1, hi = -1;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (d[(y * w + x) * 4] < 200) { if (lo < 0) lo = x; hi = x; break; }
    }
  }
  return lo < 0 ? 0 : hi - lo + 1;
}

function capHeight(font) {
  const { src, w, h } = raster(font, 'H');
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  let top = -1, bot = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4] < 200) { if (top < 0) top = y; bot = y; break; }
    }
  }
  return top < 0 ? 0 : bot - top + 1;
}

(async () => {
  await Promise.all(FONTS.map(async (f) => {
    const face = new FontFace(f.family, 'url(' + f.uri + ')');
    await face.load();
    document.fonts.add(face);
  }));
  await document.fonts.ready;

  // The guard from DECISIONS.md 3.8: if every candidate measures identically, none
  // of them loaded and the sheet would publish a fallback as a comparison.
  const widths = FONTS.map((f) => inkWidth(f.family, 'Modeless Dialog Box'));
  console.log('ink widths: ' + JSON.stringify(widths)
    + ' loaded: ' + [...document.fonts].map((x) => x.family + ':' + x.status).join(','));
  if (new Set(widths).size === 1) {
    document.body.innerHTML = '<h1 style="color:#900">Fonts did not load: every '
      + 'candidate measured ' + widths[0] + 'px</h1>';
    window.__loadFailed = true;
    window.__done = true;
    return;
  }

  for (const cv of document.querySelectorAll('canvas.raster')) {
    const { src, w, h } = raster(cv.dataset.font, cv.dataset.text);
    cv.width = w * ZOOM; cv.height = h * ZOOM;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, w, h, 0, 0, w * ZOOM, h * ZOOM);
  }

  for (const box of document.querySelectorAll('.metrics')) {
    const font = box.dataset.metricsFor;
    const cap = capHeight(font);
    const { src } = raster(font, 'Modeless Dialog Box');
    const greys = greyCount(src);
    const entries = Object.entries(TARGET.ink);
    let exact = 0; let worst = 0; let worstName = '';
    for (const [text, want] of entries) {
      const got = inkWidth(font, text);
      const d = got - want;
      if (d === 0) exact++;
      if (Math.abs(d) > Math.abs(worst)) { worst = d; worstName = text; }
    }
    box.textContent =
      'cap ' + cap + 'px (want ' + TARGET.capHeight + ')\\n'
      + 'greys ' + greys + (greys === 2 ? ' — on the grid' : ' — SOFT') + '\\n'
      + 'ink exact ' + exact + '/' + entries.length + '\\n'
      + 'worst ' + (worst > 0 ? '+' : '') + worst + 'px on ' + worstName;
  }
  window.__done = true;
})();
</script></body></html>`
}

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => console.log(`[page] ${m.text()}`))
await page.setContent(buildHtml(), { waitUntil: 'load' })
await page.waitForFunction(() => window.__done === true, { timeout: 30_000 })
// Checked via a flag rather than by scanning the body text: the body contains the
// page script, so a text scan matches the guard's own source and always fires.
const failed = await page.evaluate(() => window.__loadFailed === true)
if (failed) {
  await browser.close()
  throw new Error('every candidate measured the same width — the fonts did not load')
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, await page.locator('body').screenshot())
await browser.close()
console.log(`wrote ${OUT}`)
for (const r of RESULTS) {
  console.log(`  ${r.verdict.toUpperCase().padEnd(7)} ${r.face} — cap ${r.capHeightAt16}px @16px, `
    + `off-grid coords ${r.offGridCoords}, ink exact ${r.inkExact}`)
}
