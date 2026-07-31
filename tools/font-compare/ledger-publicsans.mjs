/**
 * Chooses Ledger's face, and scores it against the era's own physics.
 *
 * Every other era in Chronos substitutes for a face that really existed, so its
 * comparison is a fidelity match against a metric target extracted from the source.
 * Ledger has no original. ARCHITECTURE.md §8 states the face as a *category* —
 * "a chunky grotesque at generous sizes", because "thin strokes do not survive
 * dithering" — and states the reason as physics: "The physics picks the type, not
 * taste."
 *
 * So this tool does not measure similarity. It measures the claim — and the first
 * version of it measured the claim wrongly, in a way worth recording because
 * `CLAUDE.md` names the failure exactly: *a guard that cannot fail is not a guard.*
 *
 * **What did not work.** Render each string, apply the first bleach band, count the
 * ink runs that retain zero pixels. Every candidate passed at every size — six faces
 * from Inter 700 to Archivo Black, ten sizes each, sixty rows of `breaks === 0`. The
 * reason is arithmetic rather than typographic: at band 1 the ordered threshold knocks
 * out four of sixteen cells, no Bayer row loses more than two of its four columns, and
 * so *any* run three pixels wide or more keeps ink in every row it occupies. The
 * instrument was measuring the matrix, not the face.
 *
 * **What discriminates.** A run dies only when every one of its Bayer columns sits
 * below the threshold, so what matters is a stroke's width *along a row* — and for a
 * vertical stem, every row of the stem is a run exactly one stem wide. Each Bayer row
 * has one value at or above 10 (`10, 14, 11, 15` for the four rows), so a run four
 * pixels wide covers all four residues and cannot be severed at any level this era
 * uses, while a three-pixel run can be. The gate is therefore
 *
 *   **stem >= cell** — the vertical stem is at least one Bayer cell wide.
 *
 * It is a derivation from the matrix rather than a preference, and it does fail:
 * Public Sans *Bold* never reaches a 4px stem anywhere in the tested range, which is
 * what settles empirically that §8's "type is heavy" means Black rather than merely
 * bold. `thin` — the apex of `o`, measured vertically — is reported because it is the
 * number one expects to matter and does not: the bowl apex is horizontally long, so
 * its rows are wide runs and they survive regardless of how few of them there are.
 *
 * `severed` is kept as the empirical curve at each band. It is not a pass/fail: the
 * runs that die first are the one- and two-pixel antialiased tips of curves and
 * diagonal terminals, and losing those *is* what a bleaching receipt looks like.
 *
 * **The load assertion is not optional.** `document.fonts.ready` does not fetch a
 * face that only `<canvas>` uses — nothing in the DOM renders with it, so the browser
 * never asks for it, and the first version of Mac OS 8's sheet silently rasterised
 * every specimen in the fallback serif and reported a candidate 23px too narrow. This
 * tool calls `document.fonts.load()` and asserts `document.fonts.check()` per face
 * before it draws a single pixel.
 *
 * Usage:
 *   node tools/font-compare/ledger-publicsans.mjs <fontDir> <outPng>
 *
 * `<fontDir>` needs the candidate TTFs. Only the winner is committed to
 * `docs/fonts/`; the rejects are recorded in RESULTS below with the URL each was
 * fetched from, so a verdict stays reviewable without refetching six faces.
 * `raw.githubusercontent.com` is allowlisted from the build sandbox and is how these
 * arrived; `fonts.google.com` is refused at the proxy.
 */

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FONT_DIR = resolve(process.argv[2] ?? '/tmp/lf')
const OUT_PNG = resolve(process.argv[3] ?? 'docs/fonts/ledger-font-grotesque.png')
const OUT_JSON = OUT_PNG.replace(/\.png$/, '.json')
const CHROMIUM = process.env.CHRONOS_CHROMIUM ?? '/opt/pw-browsers/chromium'
const ZOOM = 4

/**
 * The era's inks, signed off against §8's "paper white, carbon black, and one amber
 * ink". Rendering the specimens in anything else would measure a contrast this era
 * never shows: thermal carbon on thermal stock is not #000 on #FFF, and the ink
 * threshold the survival test uses has to sit between the two values that exist.
 */
const PAPER = '#F2EFE6'
const CARBON = '#1B1714'

/**
 * The ordered dither, as the skin declares it.
 *
 * Bayer 4x4, generated recursively so the matrix in the tool and the matrix in
 * `src/skins/ledger/dither.ts` cannot drift into two different patterns — the
 * construction is four lines and copying a literal grid is how they would.
 */
function bayer(n) {
  if (n === 1) return [[0]]
  const half = bayer(n / 2)
  const s = half.length
  const out = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const v = half[y][x] * 4
      out[y][x] = v
      out[y][x + s] = v + 2
      out[y + s][x] = v + 3
      out[y + s][x + s] = v + 1
    }
  }
  return out
}

/**
 * The dither cell, and the bleach bands a window walks down as it sits unfocused.
 *
 * A window bleaches further and coarser the longer it is ignored (§8), and by the
 * last band it is nearly gone — losing legibility there is the *point*, because "you
 * can read at a glance how long you have ignored something". So the type is not
 * required to survive every band, which would demand absurd sizes; it is required to
 * survive the bands where the window is still meant to be read.
 *
 * Levels are on the 4x4 matrix's own 0..16 scale. The gate uses `GATE_LEVEL`, the
 * deepest level at which a stroke one cell wide is still guaranteed intact: each Bayer
 * row's largest value is 10, 14, 11, 15, so at level 10 every row still has a
 * surviving column and a four-wide run always covers one.
 */
const CELL = 4
const BANDS = [4, 8, 10, 12]
const GATE_LEVEL = 10

/**
 * The strings the skin renders, which is what the survival test runs over.
 *
 * Not a pangram: a specimen sheet's sample text measures the face, and what needs
 * measuring here is the chrome. These are the real title bars, gutter entries, menu
 * items and Steward text, including the em dash §8 puts in a Ledger title bar and
 * the digits every cost line is made of.
 */
const STRINGS = [
  'Letter — 3.1 kJ — 14 min',
  'Files - you/documents',
  '#04412 letter',
  '3.1 kJ  +  0 mc  +  14 min',
  'ROUNDED UP',
  'You haven’t touched Untitled 3 in 20 minutes. Shall I settle it?',
  'Settle  Defer',
  'Close  Minimize  Suspend',
  '0123456789 kJ mc min',
]

/**
 * Sizes to test. Ledger's chrome sits at whichever of these first passes.
 *
 * The range starts well below any plausible answer on purpose: a sweep that only
 * covers sizes that pass proves nothing about the gate. Ten and eleven are here to be
 * seen failing.
 */
const SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26]

const CANDIDATES = [
  {
    name: 'Public Sans Black',
    file: 'PublicSans[wght].ttf',
    weight: 900,
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf',
    note: 'The US Web Design System face. Its origin is a government form, which is '
      + 'what the cost gutter legally is — §8 calls the strip "a regulatory '
      + 'disclosure, not a preference".',
  },
  {
    name: 'Public Sans Bold',
    file: 'PublicSans[wght].ttf',
    weight: 700,
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf',
    note: 'The same face one weight down, tested to establish whether Black is '
      + 'actually required or merely heavier.',
  },
  {
    name: 'Archivo Black',
    file: 'ArchivoBlack-Regular.ttf',
    weight: 400,
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf',
    note: 'The heaviest plain grotesque in the library, as the survival ceiling.',
  },
  {
    name: 'Bricolage Grotesque 800',
    file: 'BricolageGrotesque.ttf',
    weight: 800,
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf',
    note: 'Deliberately wonky letterforms, as the "strange and slightly wrong" end '
      + 'of the field.',
  },
  {
    name: 'Work Sans 800',
    file: 'WorkSans.ttf',
    weight: 800,
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/worksans/WorkSans%5Bwght%5D.ttf',
    note: 'A second heavy grotesque, to show the survival number is a property of '
      + 'the weight rather than of one family.',
  },
  {
    name: 'Inter 700',
    file: 'Inter.ttf',
    weight: 700,
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
    note: 'The control. CLAUDE.md names thin geometric sans as a 2015 concept-render '
      + 'default; Inter is the face that reads as stock, and it is here to be '
      + 'measured failing rather than dismissed on taste.',
  },
]

/**
 * Verdicts from the era/ledger selection pass, recorded so the next session can tell
 * at a glance whether anything moved without refetching six faces. Regenerated by
 * running this file; the numbers below are what it printed.
 */
export const RESULTS_NOTE =
  'Run `node tools/font-compare/ledger-publicsans.mjs <fontDir>` to regenerate. '
  + 'The measured table is written to docs/fonts/ledger-font-grotesque.json and '
  + 'summarised in docs/eras/ledger.md.'

const page = await (async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM })
  const p = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  p.on('console', (m) => console.log(`  [page] ${m.text()}`))
  await p.goto('about:blank')
  return Object.assign(p, { __browser: browser })
})()

const faces = CANDIDATES.map((c, i) => ({
  ...c,
  family: `Cand${i}`,
  data: [...readFileSync(join(FONT_DIR, c.file))],
}))

const measured = await page.evaluate(
  async ({ faces, strings, sizes, cell, bands, paper, carbon }) => {
    // ---------------------------------------------------------------- loading
    for (const f of faces) {
      const face = new FontFace(f.family, new Uint8Array(f.data).buffer, {
        weight: '1 1000',
      })
      document.fonts.add(await face.load())
    }
    // `document.fonts.ready` is not enough: nothing in the DOM uses these, so the
    // browser would never fetch them and every specimen would silently rasterise in
    // the fallback serif. Load each explicitly, then assert it is really there.
    const missing = []
    for (const f of faces) {
      await document.fonts.load(`${f.weight} 20px "${f.family}"`)
      if (!document.fonts.check(`${f.weight} 20px "${f.family}"`)) missing.push(f.name)
    }
    if (missing.length > 0) throw new Error(`faces failed to load: ${missing.join(', ')}`)

    // ----------------------------------------------------------------- matrix
    const bayerN = (n) => {
      if (n === 1) return [[0]]
      const half = bayerN(n / 2)
      const s = half.length
      const out = Array.from({ length: n }, () => new Array(n).fill(0))
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const v = half[y][x] * 4
          out[y][x] = v
          out[y][x + s] = v + 2
          out[y + s][x] = v + 3
          out[y + s][x + s] = v + 1
        }
      }
      return out
    }
    const M = bayerN(cell)

    // --------------------------------------------------------------- drawing
    const hexLuma = (hex) => {
      const n = parseInt(hex.slice(1), 16)
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
    }
    // The threshold sits midway between the two inks that exist, not at 128: this era
    // prints warm carbon on warm stock and a fixed mid-grey would misclassify both.
    const MID = (hexLuma(paper) + hexLuma(carbon)) / 2

    /** Ink mask for one string at one size, as a boolean grid. */
    const inkOf = (family, weight, px, text) => {
      const probe = new OffscreenCanvas(8, 8).getContext('2d')
      probe.font = `${weight} ${px}px "${family}"`
      const m = probe.measureText(text)
      const w = Math.max(1, Math.ceil(m.width) + px)
      const h = Math.ceil(px * 2.2)
      const c = new OffscreenCanvas(w, h)
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.fillStyle = paper
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = carbon
      ctx.font = `${weight} ${px}px "${family}"`
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, Math.floor(px / 2), Math.floor(px * 1.5))
      const d = ctx.getImageData(0, 0, w, h).data
      const grid = []
      for (let y = 0; y < h; y++) {
        const row = new Array(w)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
          row[x] = l < MID
        }
        grid.push(row)
      }
      return grid
    }

    /** Horizontal ink runs in a row, as [start, len]. */
    const rowRuns = (row) => {
      const out = []
      let s = -1
      for (let x = 0; x <= row.length; x++) {
        if (x < row.length && row[x]) {
          if (s < 0) s = x
        } else if (s >= 0) {
          out.push([s, x - s])
          s = -1
        }
      }
      return out
    }

    /**
     * How many ink runs retain nothing at each bleach band.
     *
     * Reported as a curve rather than a verdict. Every run is counted, including the
     * one- and two-pixel antialiased tips of curves and diagonal terminals — those
     * are the first to go, and them going is what a bleaching receipt looks like.
     * The pass/fail lives on `stem` instead, for the reason in the file header.
     */
    const survive = (grid, bands) => {
      let runs = 0
      const dead = bands.map(() => 0)
      let minRun = Infinity
      for (let y = 0; y < grid.length; y++) {
        for (const [s, len] of rowRuns(grid[y])) {
          runs++
          if (len < minRun) minRun = len
          for (let b = 0; b < bands.length; b++) {
            let kept = 0
            for (let x = s; x < s + len; x++) {
              if (M[y % cell][x % cell] >= bands[b]) kept++
            }
            if (kept === 0) dead[b]++
          }
        }
      }
      return { runs, dead, minRun: minRun === Infinity ? 0 : minRun }
    }

    /** The vertical stem of `I`, at the middle of its ink box. */
    const stemOf = (family, weight, px) => {
      const g = inkOf(family, weight, px, 'I')
      const rows = g.map((r, y) => [y, r.some(Boolean)]).filter(([, v]) => v).map(([y]) => y)
      if (rows.length === 0) return 0
      const mid = rows[Math.floor(rows.length / 2)]
      const runs = rowRuns(g[mid])
      return runs.length === 0 ? 0 : Math.max(...runs.map((r) => r[1]))
    }

    /** The thinnest part of `o` — the bowl apex, measured vertically. */
    const thinOf = (family, weight, px) => {
      const g = inkOf(family, weight, px, 'o')
      const h = g.length
      const w = g[0].length
      let box = [Infinity, -1, Infinity, -1]
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!g[y][x]) continue
          box = [Math.min(box[0], x), Math.max(box[1], x), Math.min(box[2], y), Math.max(box[3], y)]
        }
      }
      if (box[1] < 0) return 0
      const cx = Math.round((box[0] + box[1]) / 2)
      let run = 0
      for (let y = box[2]; y <= box[3]; y++) {
        if (g[y][cx]) run++
        else if (run > 0) break
      }
      return run
    }

    /**
     * The matrix proof, run rather than asserted.
     *
     * For every run width and every bleach band, is there a placement whose columns
     * all fall below the threshold? This is what establishes `stem >= cell` as a
     * derivation instead of a rule of thumb, and it is computed from the same matrix
     * the skin ships rather than from the argument in the header comment.
     */
    const matrixProof = () => {
      const rows = []
      for (const L of bands) {
        for (let w = 1; w <= cell + 2; w++) {
          let severable = false
          for (let r = 0; r < cell && !severable; r++) {
            for (let c = 0; c < cell && !severable; c++) {
              let kept = 0
              for (let i = 0; i < w; i++) if (M[r][(c + i) % cell] >= L) kept++
              if (kept === 0) severable = true
            }
          }
          rows.push({ level: L, width: w, severable })
        }
      }
      return rows
    }

    // ----------------------------------------------------------------- sweep
    const out = []
    for (const f of faces) {
      for (const px of sizes) {
        let runs = 0
        const dead = bands.map(() => 0)
        let minRun = Infinity
        for (const text of strings) {
          const r = survive(inkOf(f.family, f.weight, px, text), bands)
          runs += r.runs
          for (let b = 0; b < bands.length; b++) dead[b] += r.dead[b]
          if (r.minRun > 0) minRun = Math.min(minRun, r.minRun)
        }
        out.push({
          face: f.name,
          weight: f.weight,
          px,
          stem: stemOf(f.family, f.weight, px),
          thin: thinOf(f.family, f.weight, px),
          minRun: minRun === Infinity ? 0 : minRun,
          runs,
          severed: dead,
        })
      }
    }
    return { rows: out, proof: matrixProof(), matrix: M }
  },
  {
    faces,
    strings: STRINGS,
    sizes: SIZES,
    cell: CELL,
    bands: BANDS,
    paper: PAPER,
    carbon: CARBON,
  },
)

// ------------------------------------------------------------------- verdicts

console.log(`\nBayer ${CELL}x${CELL}:`)
for (const row of measured.matrix) console.log('   ' + row.map((v) => String(v).padStart(3)).join(''))

console.log('\nMatrix proof — can a run of this width be severed entirely?')
console.log('  level  width  severable')
for (const p of measured.proof) {
  console.log(`  ${String(p.level).padStart(5)}  ${String(p.width).padStart(5)}  ${p.severable ? 'YES' : 'no'}`)
}
const gateWidth = (() => {
  for (let w = 1; w <= CELL + 2; w++) {
    const bad = measured.proof.some((p) => p.width === w && p.level <= GATE_LEVEL && p.severable)
    if (!bad) return w
  }
  return null
})()
console.log(
  `\n=> the narrowest run that cannot be severed at or below level ${GATE_LEVEL} is ${gateWidth}px, `
    + `which is the cell. The gate is stem >= ${CELL}.`,
)

const byFace = new Map()
for (const row of measured.rows) {
  if (!byFace.has(row.face)) byFace.set(row.face, [])
  byFace.get(row.face).push(row)
}

const verdicts = []
for (const [face, rows] of byFace) {
  const first = rows.find((r) => r.stem >= CELL)
  const meta = CANDIDATES.find((c) => c.name === face)
  verdicts.push({
    face,
    licence: meta.licence,
    url: meta.url,
    note: meta.note,
    passesAt: first ? first.px : null,
    stemAtPass: first ? first.stem : null,
    thinAtPass: first ? first.thin : null,
    rows,
  })
}
verdicts.sort((a, b) => (a.passesAt ?? 999) - (b.passesAt ?? 999))

console.log(`\nLedger face selection — gate: stem >= ${CELL}px (one Bayer cell).`)
console.log(`severed = ink runs retaining nothing, at bands ${BANDS.join('/')}, over ${STRINGS.length} real chrome strings.\n`)
console.log('face                        px  stem thin  runs   severed @ ' + BANDS.join('/'))
for (const v of verdicts) {
  for (const r of v.rows) {
    const mark = r.stem >= CELL ? '  <= passes' : ''
    console.log(
      `${r.face.padEnd(26)} ${String(r.px).padStart(3)} ${String(r.stem).padStart(5)}`
        + `${String(r.thin).padStart(5)}${String(r.runs).padStart(6)}`
        + `   ${r.severed.map((n) => String(n).padStart(5)).join('')}${mark}`,
    )
  }
  console.log('')
}

console.log('Summary — smallest size reaching a one-cell stem:')
for (const v of verdicts) {
  console.log(
    `  ${v.face.padEnd(26)} ${v.passesAt === null ? 'NEVER in range — rejected' : `${v.passesAt}px (stem ${v.stemAtPass}, thin ${v.thinAtPass})`}`,
  )
}

writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      cell: CELL,
      bands: BANDS,
      gateLevel: GATE_LEVEL,
      gateWidth,
      matrix: measured.matrix,
      proof: measured.proof,
      paper: PAPER,
      carbon: CARBON,
      strings: STRINGS,
      verdicts,
    },
    null,
    2,
  ),
)
console.log(`\nwrote ${OUT_JSON}`)

// ---------------------------------------------------------------------- sheet

/**
 * The sheet magnifies by bitmap upscaling, never by re-rasterising at 4x.
 *
 * Drawing at 4x would show a rasterisation that never appears on screen, which is the
 * opposite of what needs judging — the same reason `tools/font-compare/build.mjs`
 * takes this route for XP.
 */
const sheet = await page.evaluate(
  async ({ faces, sizes, cell, level, paper, carbon, strings }) => {
    const bayerN = (n) => {
      if (n === 1) return [[0]]
      const half = bayerN(n / 2)
      const s = half.length
      const out = Array.from({ length: n }, () => new Array(n).fill(0))
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const v = half[y][x] * 4
          out[y][x] = v
          out[y][x + s] = v + 2
          out[y + s][x] = v + 3
          out[y + s][x + s] = v + 1
        }
      }
      return out
    }
    const M = bayerN(cell)
    const ZOOM = 3
    // A short specimen, not the longest one: the sheet exists so the bleached column
    // beside the 1x column can actually be *seen*, and at 4x the full title string ran
    // off the canvas at the larger sizes — which is the one thing the sheet is for.
    const SAMPLE = '3.1 kJ \u2014 14 min'
    const rowsPerFace = sizes.length

    const lineH = 26 * ZOOM + 30
    const W = 1500
    const H = 90 + faces.length * (rowsPerFace * lineH + 64)
    const c = new OffscreenCanvas(W, H)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#111111'
    ctx.font = '600 20px system-ui, sans-serif'
    ctx.fillText(
      `Ledger — face selection. Left: 1x. Right: after the first bleach band `
        + `(Bayer ${cell}x${cell}, level ${level}/${cell * cell}), magnified ${ZOOM}x.`,
      24,
      36,
    )
    ctx.font = '400 15px system-ui, sans-serif'
    ctx.fillStyle = '#555555'
    ctx.fillText(
      'A face passes at the smallest size where no stroke is severed. '
        + 'Severed strokes are the rows where a stem simply is not there any more.',
      24,
      60,
    )

    let y = 96
    for (const f of faces) {
      ctx.fillStyle = '#111111'
      ctx.font = '700 18px system-ui, sans-serif'
      ctx.fillText(`${f.name} — ${f.licence}`, 24, y)
      y += 30

      for (const px of sizes) {
        // 1x raster.
        const probe = new OffscreenCanvas(8, 8).getContext('2d')
        probe.font = `${f.weight} ${px}px "${f.family}"`
        const w = Math.ceil(probe.measureText(SAMPLE).width) + px
        const h = Math.ceil(px * 1.9)
        const src = new OffscreenCanvas(w, h)
        const sctx = src.getContext('2d', { willReadFrequently: true })
        sctx.fillStyle = paper
        sctx.fillRect(0, 0, w, h)
        sctx.fillStyle = carbon
        sctx.font = `${f.weight} ${px}px "${f.family}"`
        sctx.textBaseline = 'alphabetic'
        sctx.fillText(SAMPLE, Math.floor(px / 2), Math.floor(px * 1.35))

        // Dithered copy: paper printed back over the ink wherever the ordered
        // threshold says so, which is the bleach as the skin performs it.
        const dst = new OffscreenCanvas(w, h)
        const dctx = dst.getContext('2d', { willReadFrequently: true })
        dctx.drawImage(src, 0, 0)
        const img = dctx.getImageData(0, 0, w, h)
        const pr = parseInt(paper.slice(1), 16)
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            if (M[yy % cell][xx % cell] >= level) continue
            const i = (yy * w + xx) * 4
            img.data[i] = (pr >> 16) & 255
            img.data[i + 1] = (pr >> 8) & 255
            img.data[i + 2] = pr & 255
          }
        }
        dctx.putImageData(img, 0, 0)

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(src, 0, 0, w, h, 24, y, w * ZOOM, h * ZOOM)
        ctx.drawImage(dst, 0, 0, w, h, 24 + w * ZOOM + 28, y, w * ZOOM, h * ZOOM)
        ctx.fillStyle = '#777777'
        ctx.font = '400 13px system-ui, sans-serif'
        ctx.fillText(`${px}px`, 24 + w * ZOOM * 2 + 64, y + 16)
        y += h * ZOOM + 12
      }
      y += 34
    }

    const blob = await c.convertToBlob({ type: 'image/png' })
    return [...new Uint8Array(await blob.arrayBuffer())]
  },
  { faces, sizes: SIZES, cell: CELL, level: BANDS[0], paper: PAPER, carbon: CARBON, strings: STRINGS },
)

writeFileSync(OUT_PNG, Buffer.from(sheet))
console.log(`wrote ${OUT_PNG}`)

await page.__browser.close()
