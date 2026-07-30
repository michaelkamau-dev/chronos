/**
 * Renders the Mac OS X Tiger substitute-face specimen: DejaVu Sans for Lucida Grande.
 *
 * `CLAUDE.md`: *"Do not build on an unresolved font. Name the specific substitute face
 * and show a rendered comparison at the sizes the era actually uses before building
 * any chrome that depends on it."* The face is named in ARCHITECTURE.md §7 and is not
 * reopened here — Luxi Sans is the obvious Lucida relative, by the same designers, and
 * its licence prohibits modification, which blocks subsetting. This tool supplies the
 * other half: the rendered comparison, and an objective number for the loss.
 *
 * **The target is Apple's own rasterisation.** Windows XP's Tahoma row was ranked
 * against advance widths parsed from Wine's purpose-built metric substitute. Tiger can
 * do better, because the HIG's figures are 1:1 — Figure 12-11 contains Mac OS X's
 * actual rendering of known strings in the system font at 13px. `measure-tiger-chrome.py`
 * measures their ink widths and writes the crops; this compares against them and puts
 * the two renderings side by side at 4x so the divergence is visible, not just tabulated.
 *
 * Ink width, first inked column to last, on both sides — because ink is what a bitmap
 * shows. Advance width would not be comparable to a measurement taken off a screenshot.
 *
 * Two deliberate choices carried over from the XP tool:
 *
 * - **Magnification is bitmap upscaling, not re-rasterisation.** Text is drawn once at
 *   the real pixel size, then that canvas is redrawn at 4x with smoothing off. CSS
 *   `zoom` would re-render the glyphs larger and show a rasterisation that never
 *   appears on screen.
 * - **Sizes are integers.** They happen to be the point sizes here, because Mac OS X
 *   drew at a nominal 72 DPI, so 13pt is 13px exactly — the opposite of Windows, where
 *   8pt at 96 DPI is 10.667px and the era rasterised it at 11. The rule is the same;
 *   the arithmetic is the identity.
 *
 * Usage: node tools/font-compare/tiger-lucida.mjs [fontDir] [appleCropDir] [outDir]
 */

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FONT_DIR = resolve(process.argv[2] ?? '/usr/share/fonts/truetype/dejavu')
const APPLE_DIR = resolve(process.argv[3] ?? 'docs/fonts/tiger-apple-type')
const OUT_DIR = resolve(process.argv[4] ?? 'docs/fonts')
const CHROMIUM = process.env.CHRONOS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const ZOOM = 4

/**
 * Ink widths measured off Apple's own 1:1 rendering, system font at 13px.
 * Produced by `python3 tools/pdf-extract/measure-tiger-chrome.py`, which also writes
 * the matching crops into APPLE_DIR. Only strings with no ellipsis are used: an
 * ellipsis is one glyph in Lucida Grande and could be three in a substitute, which
 * would put the divergence in the wrong column.
 */
const TARGETS = [
  { text: 'Back', ink: 29, crop: 'tiger-lucida-back.png' },
  { text: 'Enclosing Folder', ink: 110, crop: 'tiger-lucida-enclosing-folder.png' },
  { text: 'Recent Folders', ink: 97, crop: 'tiger-lucida-recent-folders.png' },
]

/** Every size Tiger specifies, documented in the HIG p119-120 and p200. */
const SIZES = [
  { px: 13, weight: 400, role: 'System font', where: 'menus, dialogs, full-size controls' },
  { px: 13, weight: 700, role: 'Emphasized system', where: 'alert message text; use sparingly' },
  { px: 12, weight: 400, role: 'View font', where: 'lists and tables' },
  { px: 11, weight: 400, role: 'Small system', where: 'help tags, column headings, small controls' },
  { px: 11, weight: 700, role: 'Emphasized small', where: 'group titles without a group box' },
  { px: 10, weight: 400, role: 'Label font', where: 'toolbar button labels, slider ticks' },
  { px: 9, weight: 400, role: 'Mini system', where: 'mini controls, utility window labels' },
  { px: 14, weight: 700, role: 'Application title', where: 'About windows only' },
]

const SAMPLES = [
  'File Edit View Go Window Help',
  'Enclosing Folder',
  'Get Info',
  'Save changes before closing?',
]

function dataUri(file) {
  return `data:font/ttf;base64,${readFileSync(join(FONT_DIR, file)).toString('base64')}`
}

function appleCrop(name) {
  const p = join(APPLE_DIR, name)
  if (!existsSync(p)) {
    throw new Error(
      `${p} is missing — run tools/pdf-extract/measure-tiger-chrome.py first, ` +
        'which extracts Apple\'s crops from the HIG. Without them this sheet would ' +
        'compare the substitute against nothing.',
    )
  }
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`
}

const regular = dataUri('DejaVuSans.ttf')
const bold = dataUri('DejaVuSans-Bold.ttf')

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { margin: 0; padding: 22px; background: #fff; color: #111;
  font: 13px/1.45 'DejaVu Sans', sans-serif; max-width: 1180px; }
h1 { font-size: 18px; margin: 0 0 4px; }
h2 { font-size: 14px; margin: 26px 0 8px; }
.spec { font-size: 12px; color: #444; margin: 0 0 10px; }
.note { font-size: 11px; color: #555; max-width: 940px; margin: 0 0 14px; }
.loss { font-size: 12px; background: #fdf0e3; border-left: 3px solid #b8721e;
  padding: 8px 10px; margin: 0 0 16px; max-width: 940px; }
table { border-collapse: collapse; }
th, td { border: 1px solid #d8d8d8; vertical-align: top; padding: 8px 10px; text-align: left; }
thead th { background: #f2f2f2; font-size: 11px; }
.role { width: 210px; background: #fafafa; font-size: 12px; }
.role b { font-size: 13px; }
.role span { display: block; font-size: 10px; color: #666; margin-top: 2px; }
.px { font-family: 'DejaVu Sans Mono', monospace; font-size: 11px; color: #333; }
canvas.raster, img.crop { display: block; margin-bottom: 6px; image-rendering: pixelated; }
.pair { margin-bottom: 14px; }
.pair .lbl { font-family: 'DejaVu Sans Mono', monospace; font-size: 10px; color: #666; margin: 0 0 3px; }
.pair .apple { border-left: 3px solid #2f5d99; padding-left: 7px; }
.pair .ours { border-left: 3px solid #b8721e; padding-left: 7px; }
.verdict { font-family: 'DejaVu Sans Mono', monospace; font-size: 11px; margin-top: 4px; }
</style></head><body>
<h1>Mac OS X Tiger — Lucida Grande substitute: <b>DejaVu Sans</b></h1>
<p class="spec">Apple documents seven roles for Lucida Grande (HIG p119–120, p200).
Mac OS X drew at a nominal 72 DPI, so every point size below is that many pixels
exactly. None of the Lucida family is redistributable.</p>

<p class="loss"><b>The loss is real and is not being minimised.</b> Luxi Sans is the
obvious relative — same designers as Lucida Grande — and its licence <b>prohibits
modification</b>, which blocks subsetting, so it cannot ship. DejaVu Sans is a
Bitstream Vera derivative: permissive, subsettable, and a visibly different face.
Lucida Grande is narrower, has a larger x-height relative to its cap height, and a
distinctly rounder bowl. The numbers below say how far off it is at the size Tiger
uses most.</p>

<h2>Against Apple's own rasterisation</h2>
<p class="note">The blue row is a crop from Figure 12-11 of the Tiger HIG — Mac OS X's
actual rendering of that string in the system font at 13px, magnified ${ZOOM}× with
smoothing off. The orange row is DejaVu Sans at 13px, rasterised once at 1× and
magnified the same way. Ink width, first inked column to last, is measured identically
on both.</p>
<div id="pairs"></div>

<h2>Every size Tiger specifies</h2>
<table>
<thead><tr><th class="role">Role</th><th>Specimen at 1× magnified ${ZOOM}×</th></tr></thead>
<tbody>
${SIZES.map(
  (s, i) => `<tr>
  <th class="role"><b>${s.role}</b>
    <span>${s.where}</span>
    <span class="px">Lucida Grande ${s.weight === 700 ? 'Bold' : 'Regular'} ${s.px}pt → <b>${s.px}px</b></span>
    <span class="px" data-metrics="${i}"></span>
  </th>
  <td>${SAMPLES.map(
    (t) =>
      `<canvas class="raster" data-px="${s.px}" data-weight="${s.weight}" data-text="${t.replace(/"/g, '&quot;')}"></canvas>`,
  ).join('')}</td>
</tr>`,
).join('')}
</tbody>
</table>

<script>
const ZOOM = ${ZOOM};
const TARGETS = ${JSON.stringify(TARGETS.map((t) => ({ ...t, uri: appleCrop(t.crop) })))};
const SIZES = ${JSON.stringify(SIZES)};

/** Rasterise once at 1x and return the bitmap plus its measured ink span. */
function raster(text, px, weight) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = weight + ' ' + px + 'px TigerSub';
  const w = Math.ceil(probe.measureText(text).width) + 4;
  const h = Math.ceil(px * 1.7) + 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#000';
  g.font = weight + ' ' + px + 'px TigerSub';
  g.textBaseline = 'alphabetic';
  g.fillText(text, 2, Math.round(px * 1.2));

  // Ink span, the same operation measure-tiger-chrome.py runs on Apple's bitmap.
  const d = g.getImageData(0, 0, w, h).data;
  let first = -1, last = -1;
  for (let x = 0; x < w; x++) {
    let inked = false;
    for (let y = 0; y < h; y++) {
      if (d[(y * w + x) * 4] < 200) { inked = true; break; }
    }
    if (inked) { if (first < 0) first = x; last = x; }
  }
  return { canvas: c, w, h, ink: first < 0 ? 0 : last - first + 1 };
}

function magnify(src, into) {
  into.width = src.w * ZOOM; into.height = src.h * ZOOM;
  const d = into.getContext('2d');
  d.imageSmoothingEnabled = false;
  d.drawImage(src.canvas, 0, 0, into.width, into.height);
  into.style.width = (src.w * ZOOM) + 'px';
  into.style.height = (src.h * ZOOM) + 'px';
}

async function run() {
  for (const [uri, weight] of [[${JSON.stringify(regular)}, '400'], [${JSON.stringify(bold)}, '700']]) {
    const f = new FontFace('TigerSub', 'url(' + uri + ')', { weight });
    await f.load();
    document.fonts.add(f);
  }
  await document.fonts.ready;

  // Guard: if the face did not load, every size measures like the fallback and the
  // sheet is a comparison of one default font against itself. Same failure the XP
  // tool shipped once and now refuses to.
  const probeA = raster('Enclosing Folder', 13, 400).ink;
  const probeB = raster('Enclosing Folder', 9, 400).ink;
  if (probeA === probeB) throw new Error('font did not load: 13px and 9px measured identically');

  const out = [];
  const host = document.getElementById('pairs');
  for (const t of TARGETS) {
    const mine = raster(t.text, 13, 400);
    const dev = ((mine.ink - t.ink) / t.ink) * 100;
    out.push({ text: t.text, apple: t.ink, ours: mine.ink, dev: +dev.toFixed(1) });

    const box = document.createElement('div');
    box.className = 'pair';
    box.innerHTML =
      '<p class="lbl">' + t.text + '</p>' +
      '<div class="apple"><p class="lbl">Apple, Lucida Grande 13px — ink ' + t.ink + 'px</p>' +
      '<img class="crop" src="' + t.uri + '"></div>' +
      '<div class="ours"><p class="lbl">DejaVu Sans 13px — ink ' + mine.ink + 'px</p></div>' +
      '<p class="verdict">' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + '% ' +
      (Math.abs(dev) < 6 ? '' : (dev > 0 ? '(wider than Apple)' : '(narrower than Apple)')) + '</p>';
    host.appendChild(box);
    const img = box.querySelector('img.crop');
    img.style.width = (img.naturalWidth || 0) ? '' : '';
    img.onload = () => {
      img.style.width = (img.naturalWidth * ZOOM) + 'px';
      img.style.height = (img.naturalHeight * ZOOM) + 'px';
    };
    if (img.complete && img.naturalWidth) {
      img.style.width = (img.naturalWidth * ZOOM) + 'px';
      img.style.height = (img.naturalHeight * ZOOM) + 'px';
    }
    const cv = document.createElement('canvas');
    cv.className = 'raster';
    box.querySelector('.ours').appendChild(cv);
    magnify(mine, cv);
  }

  document.querySelectorAll('canvas.raster[data-text]').forEach((cv) => {
    magnify(raster(cv.dataset.text, +cv.dataset.px, cv.dataset.weight), cv);
  });

  const metrics = [];
  document.querySelectorAll('[data-metrics]').forEach((el) => {
    const s = SIZES[+el.dataset.metrics];
    const g = document.createElement('canvas').getContext('2d');
    g.font = s.weight + ' ' + s.px + 'px TigerSub';
    const cap = g.measureText('H').actualBoundingBoxAscent;
    const xh = g.measureText('x').actualBoundingBoxAscent;
    el.textContent = 'cap ' + cap.toFixed(1) + 'px · x-ht ' + xh.toFixed(1) +
      'px · ratio ' + (xh / cap).toFixed(3);
    metrics.push({ role: s.role, px: s.px, weight: s.weight, cap: +cap.toFixed(2), xHeight: +xh.toFixed(2) });
  });

  window.__result = { targets: out, metrics };
  document.body.dataset.ready = '1';
}
run().catch((e) => { window.__error = String(e); document.body.dataset.ready = 'error'; });
</script></body></html>`

mkdirSync(OUT_DIR, { recursive: true })
const htmlPath = join(OUT_DIR, 'tiger-font.html')
writeFileSync(htmlPath, html)

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1240, height: 1400 }, deviceScaleFactor: 1 })
await page.goto(`file://${htmlPath}`)
await page.waitForFunction(() => document.body.dataset.ready !== undefined, { timeout: 30_000 })
const err = await page.evaluate(() => window.__error)
if (err) {
  await browser.close()
  throw new Error(err)
}
await page.screenshot({ path: join(OUT_DIR, 'tiger-font-lucida.png'), fullPage: true })
const result = await page.evaluate(() => window.__result)
writeFileSync(join(OUT_DIR, 'tiger-measurements.json'), JSON.stringify(result, null, 2))
await browser.close()

console.log('DejaVu Sans against Apple\'s own 13px rasterisation:')
for (const t of result.targets) {
  console.log(
    `  ${t.text.padEnd(20)} Apple ${String(t.apple).padStart(4)}px   ` +
      `DejaVu ${String(t.ours).padStart(4)}px   ${t.dev >= 0 ? '+' : ''}${t.dev}%`,
  )
}
console.log('\nmetrics per role:')
for (const m of result.metrics) {
  console.log(
    `  ${m.role.padEnd(20)} ${m.px}px/${m.weight}  cap ${m.cap}px  x-height ${m.xHeight}px`,
  )
}
console.log(`\nWrote ${join(OUT_DIR, 'tiger-font-lucida.png')}`)
