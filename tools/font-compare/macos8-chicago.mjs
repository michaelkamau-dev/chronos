/**
 * Renders the Mac OS 8 Chicago substitute comparison sheet.
 *
 * Different in kind from `build.mjs`, and deliberately so. That tool renders XP's
 * four candidate faces against a metric target derived from Wine's Tahoma
 * substitute — a number, not a picture, because no 1:1 Microsoft rasterisation of
 * Tahoma was available. Here Apple's own rasterisation *is* available: the Mac OS 8
 * HIG's window and menu figures are lossless indexed bitmaps at 1:1, so this sheet
 * puts the candidate directly above the original pixels and lets both be read at
 * the same magnification.
 *
 * That makes the comparison falsifiable rather than impressionistic. It is also how
 * the sheet caught something no specimen would have shown: three of the four figures
 * are Chicago and one is not.
 *
 * Method, matching the rules already established for the bitmap eras:
 *
 * - **Magnification is bitmap upscaling, never re-rasterisation.** Text is drawn to
 *   a canvas at 1x and that canvas is redrawn at 4x with `imageSmoothingEnabled`
 *   off. CSS `zoom` or `transform: scale()` would re-render the glyphs at the larger
 *   size and show a rasterisation that never appears on screen.
 * - **The size is an integer pixel value, never a point value.** Chicago 12 means a
 *   12px em. `font-size: 12pt` would resolve to 16px and be a different font.
 * - Apple's reference crops are upscaled by the same integer factor through the same
 *   nearest-neighbour path, so any difference on the sheet is a difference in the
 *   type and not in the resampling.
 *
 * Usage: node tools/font-compare/macos8-chicago.mjs <fontFile> <refDir> <outFile>
 */

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const FONT = resolve(process.argv[2] ?? 'src/skins/macos8/fonts/chicago-sub.woff2')
const REF_DIR = resolve(process.argv[3] ?? 'ref')
const OUT = resolve(process.argv[4] ?? 'docs/fonts/macos8-chicago.png')
const CHROMIUM = process.env.CHRONOS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const ZOOM = 4

/** Chicago 12 is a 12px em. Every documented Platinum type metric follows from it. */
const SIZE = 12

const b64 = (p) => readFileSync(p).toString('base64')

/**
 * Apple's own rasterisations, cropped from the figure bitmaps at 1:1.
 *
 * `face` records which face the measurement says each crop is, which is a finding
 * rather than an assumption — see docs/eras/macos8.md. The three Chicago crops match
 * ChicagoFLF at 12px to a mean ink-width error of 0.02px; the Charcoal one diverges
 * by a full pixel on `t` and on `v` and on nothing else.
 */
const REFS = [
  {
    file: 'apple-active-window.png',
    text: 'Active window',
    caption: 'HIG p100 Figure 5-1 — active document window title',
    face: 'Chicago',
    appleInk: [6, 5, 4, 2, 6, 6, 10, 2, 6, 6, 6, 10],
    appleExtent: 95,
  },
  {
    file: 'apple-collapsed.png',
    text: 'Collapsed window',
    caption: 'HIG p104 Figure 5-6 — collapsed window title',
    face: 'Chicago',
    appleInk: [6, 6, 2, 2, 6, 6, 5, 6, 6, 10, 2, 6, 6, 6, 10],
    appleExtent: null,
  },
  {
    file: 'apple-active.png',
    text: 'active',
    caption: 'HIG p102 Figure 5-3 — NOT Chicago: t and v are each 1px wider',
    face: 'Charcoal',
    appleInk: [6, 5, 5, 2, 7, 6],
    appleExtent: 37,
  },
]

/** Strings the chrome actually carries, including the classic symbol glyphs. */
const SPECIMENS = [
  { label: 'Menu bar titles', text: 'File  Edit  View  Special  Help' },
  { label: 'Menu items', text: 'Undo  Cut  Copy  Paste  Clear' },
  { label: 'With keyboard equivalents', text: 'Z   X   C   A' },
  { label: 'Classic symbol set (Chicago 0x11–0x14)', text: '   ' },
  { label: 'Ellipsis and marks', text: 'Preferences…   Show Clipboard   • checked' },
  { label: 'Side bearings: J T j outdent, I 1 indent', text: 'HIJT1ij  Illinois  1984' },
  { label: 'Full alphabet', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { label: 'Lowercase and digits', text: 'abcdefghijklmnopqrstuvwxyz 0123456789' },
]

const html = `
<style>
  @font-face {
    font-family: 'Chicago Sub';
    src: url(data:font/woff2;base64,${b64(FONT)}) format('woff2');
  }
  :root { color-scheme: light }
  body {
    margin: 0; padding: 28px 32px; background: #fff; color: #111;
    font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; width: 1040px;
  }
  h1 { font-size: 19px; margin: 0 0 4px }
  h2 { font-size: 14px; margin: 30px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd }
  p.lede { margin: 0 0 6px; color: #444; max-width: 76ch }
  .pair { margin: 14px 0 22px }
  .row { display: flex; align-items: center; gap: 14px; margin: 3px 0 }
  .tag {
    width: 132px; flex: none; text-align: right; font-size: 11px; color: #666;
    font-variant-numeric: tabular-nums;
  }
  canvas, img.ref { image-rendering: pixelated; display: block }
  .cap { font-size: 11px; color: #666; margin: 2px 0 0 146px }
  .verdict { font-size: 11px; margin: 4px 0 0 146px; font-weight: 600 }
  .ok { color: #14622a } .bad { color: #97310e }
  table { border-collapse: collapse; font-size: 11px; margin-top: 8px }
  th, td { border: 1px solid #ddd; padding: 3px 7px; text-align: right }
  th:first-child, td:first-child { text-align: left }
  code { font-family: ui-monospace, monospace; font-size: 11px }
</style>

<h1>Mac OS 8 Platinum — Chicago 12 against ChicagoFLF at 12px</h1>
<p class="lede">
  Apple shipped <strong>Charcoal</strong> as Mac OS 8's system font and states that it is
  based on Chicago's metrics (HIG p17). Chicago is therefore the metric basis, and
  <strong>ChicagoFLF</strong> — Robin Casady's public-domain revival, already the System 1
  substitute — is the candidate. Chicago 12 is a <strong>12px em</strong>; Apple documents its
  overall height as 16px (p70).
</p>
<p class="lede">
  Each block below shows the candidate rendered at 12px directly above Apple's own
  rasterisation of the same string, cropped at 1:1 from a figure bitmap. Both are
  magnified ${ZOOM}× by nearest-neighbour bitmap upscaling, so nothing on this sheet is a
  re-rasterisation.
</p>

<h2>Against Apple's own pixels</h2>
<div id="pairs"></div>

<h2>Chrome specimens at 12px</h2>
<div id="specimens"></div>

<script>
const ZOOM = ${ZOOM};
const SIZE = ${SIZE};
const REFS = ${JSON.stringify(REFS)};
const SPECIMENS = ${JSON.stringify(SPECIMENS)};
const REF_SRC = ${JSON.stringify(Object.fromEntries(REFS.map((r) => [r.file, `data:image/png;base64,${b64(resolve(REF_DIR, r.file))}`])))};

/**
 * Draws text at 1x into an offscreen canvas, then blits that canvas at ZOOM with
 * smoothing off. Returns the visible canvas plus the 1x ink extent, measured from
 * the pixels rather than from measureText — measureText reports advances, and the
 * figures give ink.
 */
function drawText(text, size) {
  const pad = 2;
  const off = document.createElement('canvas');
  const octx = off.getContext('2d');
  octx.font = size + "px 'Chicago Sub'";
  const w = Math.ceil(octx.measureText(text).width) + pad * 2;
  const h = size + 8;
  off.width = w; off.height = h;
  const c2 = off.getContext('2d');
  c2.font = size + "px 'Chicago Sub'";
  c2.fillStyle = '#fff'; c2.fillRect(0, 0, w, h);
  c2.fillStyle = '#000';
  c2.textBaseline = 'alphabetic';
  c2.fillText(text, pad, size + 1);

  // Ink extent from the rendered pixels.
  const data = c2.getImageData(0, 0, w, h).data;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4] < 128) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const vis = document.createElement('canvas');
  vis.width = w * ZOOM; vis.height = h * ZOOM;
  const vctx = vis.getContext('2d');
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(off, 0, 0, w, h, 0, 0, w * ZOOM, h * ZOOM);
  return { canvas: vis, inkW: maxX - minX + 1, inkH: maxY - minY + 1 };
}

function row(tag, node) {
  const r = document.createElement('div');
  r.className = 'row';
  const t = document.createElement('div');
  t.className = 'tag';
  t.textContent = tag;
  r.appendChild(t);
  r.appendChild(node);
  return r;
}

/*
 * The face has to be *loaded* before anything is drawn, and awaiting
 * document.fonts.ready is not enough: a font that only canvas mentions is never
 * fetched, because nothing in the DOM renders with it. The first version of this
 * sheet silently rasterised every specimen in the fallback serif and reported the
 * candidate as 23px too narrow — a wrong measurement that looked like a real result.
 * document.fonts.load() forces the fetch; the check after it fails loudly instead.
 */
async function main() {
  await document.fonts.load(SIZE + "px 'Chicago Sub'");
  await document.fonts.ready;
  if (!document.fonts.check(SIZE + "px 'Chicago Sub'")) {
    document.body.dataset.ready = 'font-missing';
    return;
  }

  const pairs = document.getElementById('pairs');
  for (const ref of REFS) {
    const block = document.createElement('div');
    block.className = 'pair';

    const drawn = drawText(ref.text, SIZE);
    block.appendChild(row('ChicagoFLF 12px', drawn.canvas));

    const img = document.createElement('img');
    img.className = 'ref';
    img.src = REF_SRC[ref.file];
    await new Promise((res) => { img.onload = res; img.onerror = res; });
    img.width = img.naturalWidth * ZOOM;
    block.appendChild(row('Apple, ' + ref.face, img));

    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = ref.caption;
    block.appendChild(cap);

    const v = document.createElement('div');
    const diff = ref.appleExtent === null ? null : drawn.inkW - ref.appleExtent;
    v.className = 'verdict ' + (diff === null ? '' : Math.abs(diff) <= 1 ? 'ok' : 'bad');
    v.textContent = diff === null
      ? 'ink extent ' + drawn.inkW + 'px rendered; ink height ' + drawn.inkH + 'px'
      : 'ink extent ' + drawn.inkW + 'px rendered vs ' + ref.appleExtent
        + 'px measured in the figure (' + (diff >= 0 ? '+' : '') + diff + 'px)';
    block.appendChild(v);
    pairs.appendChild(block);
  }

  const spec = document.getElementById('specimens');
  for (const s of SPECIMENS) {
    spec.appendChild(row(s.label, drawText(s.text, SIZE).canvas));
  }
  document.body.dataset.ready = '1';
}
main();
</script>
`

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1104, height: 1400 }, deviceScaleFactor: 1 })
await page.setContent(html)
await page.waitForFunction(() => document.body.dataset.ready === '1')
// The reference <img>s size themselves on load; wait for every one to settle.
await page.waitForFunction(() =>
  [...document.querySelectorAll('img.ref')].every((i) => i.complete && i.width > 0),
)
mkdirSync(dirname(OUT), { recursive: true })
const shot = await page.screenshot({ fullPage: true })
writeFileSync(OUT, shot)
await browser.close()
console.log(`wrote ${OUT}`)
