/**
 * Renders the Windows XP substitute-face comparison sheets.
 *
 * The Windows XP Visual Guidelines specify four faces, none of which is
 * redistributable (docs/sources/winxp-luna-metrics.md). This tool renders each
 * candidate substitute at the exact sizes Microsoft specifies, using the strings
 * those surfaces actually carry, and magnifies the 1x rasterisation so the pixel
 * structure at small sizes can be judged rather than guessed at.
 *
 * Two things it does deliberately:
 *
 * - **Magnification is bitmap upscaling, not re-rasterisation.** Text is drawn to
 *   a canvas at 1x, then that canvas is drawn again at 4x with image smoothing
 *   off. Using CSS `zoom` or `transform: scale()` would re-render the glyphs at
 *   the larger size and show a rasterisation that never appears on screen — the
 *   opposite of what needs judging.
 * - **Sizes are the rounded integer pixel values, not the raw point values.**
 *   Tahoma 8pt at 96 DPI is 10.667px; Windows rasterised it at 11. A CSS
 *   `font-size: 8pt` lands glyph edges on half-pixels and softens everything.
 *
 * Usage: node tools/font-compare/build.mjs <fontDir> <outDir>
 */

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FONT_DIR = resolve(process.argv[2] ?? 'fonts')
const OUT_DIR = resolve(process.argv[3] ?? 'out')
const CHROMIUM = process.env.CHRONOS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const ZOOM = 4

/** pt → the integer pixel size Windows actually rasterised at 96 DPI. */
function ptToPx(pt) {
  return Math.round((pt * 96) / 72)
}

const ROLES = [
  {
    id: 'tahoma',
    title: 'Tahoma — system default',
    spec: 'Tahoma 8 / 9 / 11pt. Body text, menus, dialogs, labels. Only these three sizes.',
    scrutiny: 'SCRUTINISE',
    weight: 400,
    sizes: [
      { pt: 8, label: '8pt' },
      { pt: 9, label: '9pt' },
      { pt: 11, label: '11pt' },
    ],
    samples: [
      'File Edit View Favorites Tools Help',
      'Cancel',
      'Display Properties',
      'Show hidden files and folders',
    ],
    fitTest: { text: 'Cancel', maxWidth: 75 - 2 * 8, note: 'inside a 75x23 command button with 8px padding' },
    // Advance widths computed from Wine's tahoma.sfd (FullName: Tahoma), a
    // purpose-built Tahoma metric substitute whose advances were matched to the
    // original so Windows applications lay out correctly. 2048 UPM.
    target: { name: 'Tahoma (from Wine tahoma.sfd, 2048 UPM)', advance: 31.90 },
    candidates: [
      { name: 'DejaVu Sans', file: 'DejaVuSans.ttf', licence: 'Bitstream Vera derivative (permissive, modification allowed)' },
      { name: 'Liberation Sans', file: 'LiberationSans.ttf', licence: 'SIL OFL 1.1' },
      { name: 'Noto Sans', file: 'NotoSans.ttf', licence: 'SIL OFL 1.1' },
      { name: 'Open Sans', file: 'OpenSans.ttf', licence: 'SIL OFL 1.1' },
      { name: 'Source Sans 3', file: 'SourceSans3.ttf', licence: 'SIL OFL 1.1' },
      { name: 'PT Sans', file: 'PTSans-Regular.ttf', licence: 'SIL OFL 1.1' },
    ],
  },
  {
    id: 'trebuchet',
    title: 'Trebuchet MS Bold — window title bars only',
    spec: 'Trebuchet MS Bold 10pt. Window title bars, and nothing else.',
    scrutiny: 'SCRUTINISE',
    weight: 700,
    sizes: [{ pt: 10, label: '10pt' }],
    samples: [
      'My Documents',
      'Untitled - Notepad',
      'Local Disk (C:)',
      'Add or Remove Programs',
    ],
    fitTest: { text: 'Add or Remove Programs', maxWidth: 320, note: 'a long caption in a 400px window' },
    // No target: Wine ships no Trebuchet substitute and no advance-width table
    // for Trebuchet MS was reachable, so this row is judged on letterform
    // character and plausible width rather than against a number.
    target: null,
    candidates: [
      { name: 'Cabin', file: 'Cabin.ttf', licence: 'SIL OFL 1.1' },
      { name: 'Fira Sans', file: 'FiraSans-Bold.ttf', licence: 'SIL OFL 1.1', fixedWeight: true },
      { name: 'PT Sans', file: 'PTSans-Bold.ttf', licence: 'SIL OFL 1.1', fixedWeight: true },
      { name: 'Source Sans 3', file: 'SourceSans3.ttf', licence: 'SIL OFL 1.1' },
      { name: 'Open Sans', file: 'OpenSans.ttf', licence: 'SIL OFL 1.1' },
      { name: 'Liberation Sans', file: 'LiberationSans-Bold.ttf', licence: 'SIL OFL 1.1', fixedWeight: true },
    ],
  },
  {
    id: 'verdana',
    title: 'Verdana Bold — floating palette title bars only',
    spec: 'Verdana Bold 8pt. Tear-off and floating palette captions only.',
    scrutiny: 'agreed: DejaVu Sans Bold',
    weight: 700,
    sizes: [{ pt: 8, label: '8pt' }],
    samples: ['Tools', 'Colors', 'Layers'],
    fitTest: { text: 'Colors', maxWidth: 90, note: 'a narrow palette caption' },
    candidates: [
      { name: 'DejaVu Sans Bold', file: 'DejaVuSans-Bold.ttf', licence: 'Bitstream Vera derivative', fixedWeight: true, recommended: true },
      { name: 'Liberation Sans Bold', file: 'LiberationSans-Bold.ttf', licence: 'SIL OFL 1.1', fixedWeight: true },
    ],
  },
  {
    id: 'franklin',
    title: 'Franklin Gothic Medium — headers only, 14pt and above',
    spec: 'Franklin Gothic Medium 14pt+. 21pt in Control Panel titles and soft-barrier headings. Never body text.',
    scrutiny: 'agreed: Libre Franklin',
    weight: 500,
    sizes: [
      { pt: 14, label: '14pt' },
      { pt: 21, label: '21pt' },
    ],
    samples: ['Pick a category', 'Control Panel', 'Performance and Maintenance'],
    fitTest: { text: 'Performance and Maintenance', maxWidth: 420, note: 'a Control Panel category title' },
    candidates: [
      { name: 'Libre Franklin', file: 'LibreFranklin.ttf', licence: 'SIL OFL 1.1', recommended: true },
      { name: 'Source Sans 3', file: 'SourceSans3.ttf', licence: 'SIL OFL 1.1' },
    ],
  },
]

function dataUri(file) {
  const buf = readFileSync(join(FONT_DIR, file))
  return `data:font/ttf;base64,${buf.toString('base64')}`
}

function buildHtml(role) {
  // Fonts are loaded through the FontFace API rather than declared in CSS.
  // A CSS @font-face is only fetched when DOM text uses it — canvas
  // measureText and fillText do not trigger the load, so every candidate would
  // silently fall back to the same default and measure identically.
  const fontDecls = role.candidates.map((c, i) => ({
    family: `cand${i}`,
    uri: dataUri(c.file),
    weight: c.fixedWeight ? String(role.weight) : '100 900',
  }))

  const rows = role.candidates
    .map((c, i) => {
      const sizeCells = role.sizes
        .map((s) => {
          const px = ptToPx(s.pt)
          return `<td class="cell">
            <div class="sizelabel">${s.label} → <b>${px}px</b></div>
            ${role.samples
              .map(
                (t) =>
                  `<canvas class="raster" data-font="cand${i}" data-px="${px}" data-weight="${role.weight}" data-text="${t.replace(/"/g, '&quot;')}"></canvas>`,
              )
              .join('')}
          </td>`
        })
        .join('')
      return `<tr>
        <th class="name">
          <div class="candname">${c.name}${c.recommended ? ' <span class="rec">agreed</span>' : ''}</div>
          <div class="lic">${c.licence}</div>
          <div class="metrics" data-metrics-for="cand${i}"></div>
        </th>
        ${sizeCells}
      </tr>`
    })
    .join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { margin: 0; padding: 20px; background: #fff; color: #111;
  font: 13px/1.45 'DejaVu Sans', sans-serif; }
h1 { font-size: 17px; margin: 0 0 3px; }
.spec { font-size: 12px; color: #444; margin: 0 0 2px; }
.scrutiny { display: inline-block; font-size: 11px; font-weight: bold; padding: 2px 7px;
  border-radius: 2px; margin: 6px 0 14px; }
.scrutiny.SCRUTINISE { background: #ffe08a; color: #4a3200; }
.scrutiny.agreed { background: #cdebc5; color: #17400c; }
.note { font-size: 11px; color: #555; margin: 0 0 14px; max-width: 900px; }
.target { font-size: 12px; margin: 0 0 8px; padding: 6px 9px; background: #e8f0fb;
  border-left: 3px solid #2f5d99; max-width: 900px; }
.target.notarget { background: #fdf0e3; border-left-color: #b8721e; }
table { border-collapse: collapse; }
th, td { border: 1px solid #d8d8d8; vertical-align: top; padding: 8px 10px; text-align: left; }
thead th { background: #f2f2f2; font-size: 11px; }
.name { width: 210px; background: #fafafa; }
.candname { font-size: 13px; font-weight: bold; }
.rec { font-size: 10px; background: #cdebc5; color: #17400c; padding: 1px 5px; border-radius: 2px; }
.lic { font-size: 10px; color: #666; margin-top: 2px; }
.metrics { font-size: 10px; color: #333; margin-top: 6px;
  font-family: 'DejaVu Sans Mono', monospace; white-space: pre-line; }
.sizelabel { font-size: 10px; color: #666; margin-bottom: 6px;
  font-family: 'DejaVu Sans Mono', monospace; }
canvas.raster { display: block; margin-bottom: 5px; image-rendering: pixelated; }
</style></head><body>
<h1>${role.title}</h1>
<p class="spec">${role.spec}</p>
<span class="scrutiny ${role.scrutiny.startsWith('SCRUT') ? 'SCRUTINISE' : 'agreed'}">${role.scrutiny}</span>
${role.target ? `<p class="target"><b>Metric target:</b> ${role.target.name} — <code>${role.fitTest.text}</code> at ${ptToPx(Math.min(...role.sizes.map((x) => x.pt)))}px is <b>${role.target.advance}px</b>. Candidates are ranked by deviation from it.</p>` : `<p class="target notarget"><b>No metric target available</b> for this face, so it is judged on letterform character and plausible width rather than against a number.</p>`}
<p class="note">Each line is drawn once at the real integer pixel size, then that
bitmap is upscaled ${ZOOM}x with smoothing off — so what you see is the actual 1x
rasterisation magnified, not a re-render at a larger size. Point sizes are
converted at 96 DPI and rounded to the integer pixel Windows rasterised at.
<code>ADV</code> is the advance width in pixels of the fit-test string
(<code>${role.fitTest.text}</code>) at the smallest specified size; the budget is
${role.fitTest.maxWidth}px, ${role.fitTest.note}.</p>
<table>
<thead><tr><th class="name">Candidate</th>${role.sizes.map((s) => `<th>${s.label}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody>
</table>
<script>
const FONTS = ${JSON.stringify(fontDecls)};
const ZOOM = ${ZOOM};
const FIT = ${JSON.stringify(role.fitTest)};
const TARGET = ${JSON.stringify(role.target ?? null)};
const SMALLEST_PX = ${ptToPx(Math.min(...role.sizes.map((s) => s.pt)))};

function drawOne(cv) {
  const font = cv.dataset.font, px = +cv.dataset.px;
  const weight = cv.dataset.weight, text = cv.dataset.text;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = weight + ' ' + px + 'px "' + font + '"';
  const m = probe.measureText(text);
  const w = Math.ceil(m.width) + 2;
  const h = Math.ceil(px * 1.6) + 2;

  // Rasterise once at 1x.
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sc = src.getContext('2d');
  sc.fillStyle = '#fff'; sc.fillRect(0, 0, w, h);
  sc.fillStyle = '#000';
  sc.font = weight + ' ' + px + 'px "' + font + '"';
  sc.textBaseline = 'alphabetic';
  sc.fillText(text, 1, Math.round(px * 1.15));

  // Upscale that bitmap with smoothing off: true magnified pixels.
  cv.width = w * ZOOM; cv.height = h * ZOOM;
  const dc = cv.getContext('2d');
  dc.imageSmoothingEnabled = false;
  dc.drawImage(src, 0, 0, cv.width, cv.height);
  cv.style.width = (w * ZOOM) + 'px';
  cv.style.height = (h * ZOOM) + 'px';
}

async function run() {
  for (const f of FONTS) {
    const face = new FontFace(f.family, 'url(' + f.uri + ')', { weight: f.weight });
    await face.load();
    document.fonts.add(face);
  }
  await document.fonts.ready;
  document.querySelectorAll('canvas.raster').forEach(drawOne);
  document.querySelectorAll('[data-metrics-for]').forEach((el) => {
    const font = el.dataset.metricsFor;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = el.closest('tr').querySelector('canvas').dataset.weight +
      ' ' + SMALLEST_PX + 'px "' + font + '"';
    const adv = ctx.measureText(FIT.text).width;
    const m = ctx.measureText('Hxp');
    const cap = m.actualBoundingBoxAscent;
    const xm = ctx.measureText('x');
    const lines = [
      'ADV ' + adv.toFixed(1) + 'px / ' + FIT.maxWidth + ' ' + (adv <= FIT.maxWidth ? 'FITS' : 'OVER'),
    ];
    if (TARGET) {
      const dev = ((adv - TARGET.advance) / TARGET.advance) * 100;
      lines.push('vs target ' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%');
    }
    lines.push('cap ' + cap.toFixed(1) + 'px');
    lines.push('x-ht ' + xm.actualBoundingBoxAscent.toFixed(1) + 'px');
    lines.push('ratio ' + (xm.actualBoundingBoxAscent / cap).toFixed(3));
    el.textContent = lines.join('\\n');
  });
  document.body.dataset.ready = '1';
}
run();
</script></body></html>`
}

mkdirSync(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 1 })

const summary = []
for (const role of ROLES) {
  const htmlPath = join(OUT_DIR, `${role.id}.html`)
  writeFileSync(htmlPath, buildHtml(role))
  await page.goto(`file://${htmlPath}`)
  await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 30_000 })
  const out = join(OUT_DIR, `xp-font-${role.id}.png`)
  await page.screenshot({ path: out, fullPage: true })

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('tr')]
      .filter((tr) => tr.querySelector('.candname'))
      .map((tr) => ({
        name: tr.querySelector('.candname').textContent.replace(' agreed', '').trim(),
        metrics: tr.querySelector('.metrics').textContent.replace(/\n/g, ' | '),
      })),
  )
  // If every candidate measures identically the fonts did not load and the whole
  // sheet is meaningless. Fail loudly rather than publishing a comparison of one
  // fallback font against itself.
  const advs = new Set(rows.map((r) => r.metrics.split('|')[0].trim()))
  if (rows.length > 1 && advs.size === 1) {
    throw new Error(
      `${role.id}: every candidate measured identically (${[...advs][0]}) — ` +
        'the font files did not load, so this sheet would be six copies of a fallback',
    )
  }

  summary.push({ role: role.id, title: role.title, rows })
  console.log(`\n${role.title}`)
  for (const r of rows) console.log(`  ${r.name.padEnd(22)} ${r.metrics}`)
}

writeFileSync(join(OUT_DIR, 'measurements.json'), JSON.stringify(summary, null, 2))
await browser.close()
console.log(`\nWrote ${ROLES.length} sheets to ${OUT_DIR}`)
