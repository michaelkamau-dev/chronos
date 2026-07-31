/**
 * Ledger's ordered dither.
 *
 * ARCHITECTURE.md §8: "Tone comes from **ordered (Bayer) dither**, not from alpha,
 * because low-power display modes quantise." That is the whole mechanism, and it is
 * the reason every other decision in this era falls out the way it does — the type
 * size, the geometry grid, and the fact that a suspended window fades rather than
 * dims.
 *
 * ### Why the matrix is constructed rather than written down
 *
 * The recursive construction is four lines and a literal grid is sixteen numbers, so
 * a literal looks simpler. It is not: `tools/font-compare/ledger-publicsans.mjs`
 * needs the same matrix to score the face, and `test/browser/ledger-dither.ts` needs
 * it to assert what the skin rendered. Three copies of a grid drift, and the one that
 * drifts is the one nobody looks at — the failure `test/browser/stipple.ts` was
 * extracted to prevent. All three build it from this construction.
 *
 * ### The property that decides the type size, and that hides a trap
 *
 * **Bayer's lower half is exactly the even `(x + y)` sublattice, at every cell size.**
 * The recursion places `4v`, `4v+2`, `4v+3`, `4v+1` at (0,0), (1,0), (0,1), (1,1) of
 * each quadrant, and the two even-parity corners always take the two lower values. So
 * for a 4x4 matrix the values `0..7` sit on even parity and `8..15` on odd, and any
 * threshold at or below half ink lands entirely on one parity.
 *
 * That matters twice:
 *
 * 1. It is why a four-pixel run cannot be severed at the levels this era uses — it
 *    covers all four column residues, and every Bayer row keeps one value at or above
 *    10. That is the derivation behind `stem >= cell`, and behind Public Sans **Black**
 *    at 18px rather than Bold.
 * 2. It is a **trap for the parity discriminator**. `measureParity` proves Windows
 *    3.1's `GrayString` and System 1's `notPatBic` are 50% checkerboards knocked out
 *    of a glyph — ink on one parity only. An ordered dither at or below 50% would
 *    pass that test identically while being a completely different construction. So
 *    Ledger's disabled text is not a tone at all (see `menu.ts`): it is a voided
 *    ledger line, and the parity test is still run against it, to prove a negative.
 */

/**
 * An ordered Bayer matrix of side `n`, `n` a power of two.
 *
 * Values run `0 .. n*n - 1`. A pixel is inked when its matrix value is **at or above**
 * the threshold, so threshold 0 is solid and threshold `n*n` is empty.
 */
export function bayerMatrix(n: number): readonly (readonly number[])[] {
  if (n === 1) return [[0]]
  const half = bayerMatrix(n / 2)
  const s = half.length
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const v = half[y]![x]! * 4
      out[y]![x] = v
      out[y]![x + s] = v + 2
      out[y + s]![x] = v + 3
      out[y + s]![x + s] = v + 1
    }
  }
  return out
}

/**
 * The base cell.
 *
 * Four, derived rather than authored. §8 states that tone is ordered dither and that
 * the dither gets *coarser* as a window ages, which means the base has to be the
 * finer of at least two cells. Two-by-two offers five tone levels, too few for a
 * bleach whose whole job is to let you "read at a glance how long you have ignored
 * something"; eight-by-eight is the coarse end, and starting there would leave
 * nowhere to coarsen to. Four gives seventeen levels and an 8x8 to age into.
 */
export const CELL = 4

/** The coarse cell a deeply bleached window ages into. */
export const COARSE_CELL = 8

/**
 * A dither tile as an SVG data URI, for `background-image`.
 *
 * SVG rather than a canvas data URL because it is text: a test can read the tile back
 * out of the computed style and count the rects, and a reviewer can see what the
 * stylesheet is actually painting. `shape-rendering="crispEdges"` because a tile whose
 * pixels are antialiased is a grey, which is the one thing this era's tone must never
 * be — the same argument that put System 1 on an integer-scaled viewport, arrived at
 * from the dither rather than from the type.
 *
 * `level` is the threshold: pixels whose matrix value is **below** it are painted.
 * Level 0 paints nothing, level `cell*cell` paints everything.
 */
export function ditherTile(cell: number, level: number, colour: string): string {
  const m = bayerMatrix(cell)
  const rects: string[] = []
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (m[y]![x]! < level) rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}" `
    + `viewBox="0 0 ${cell} ${cell}" shape-rendering="crispEdges">`
    + `<g fill="${colour}">${rects.join('')}</g></svg>`
  // encodeURIComponent rather than base64: it keeps the markup legible in devtools and
  // in a computed-style read, which is what makes the fidelity assertions possible.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * One step of the bleach a window walks down while it is not being looked at.
 *
 * §8: "The longer a window sits unfocused, the further it bleaches toward the paper
 * colour and the coarser its dither gets." Two axes, and they are genuinely different
 * quantities — `level` is how much paper is printed back over the window, `cell` is
 * how blocky the pattern doing it is. A single "fade" number could not express the
 * coarsening, and the coarsening is half of what §8 asks for.
 */
export interface BleachBand {
  /** Milliseconds unfocused at which this band takes effect. */
  afterMs: number
  cell: number
  /** Paper knocked over the window, on the band's own `cell*cell` scale. */
  level: number
}

/**
 * The bleach ramp.
 *
 * Band 0 is the state a window enters when it suspends — §8's "suspended to a bitmap
 * within about 400ms of losing focus" — and prints no paper at all: suspension is not
 * itself a fade, it is the clock starting. The rest are `derived`, and the derivation
 * is that the ramp has to be legible at the top and illegible at the bottom, because
 * both ends carry information: a window you looked at a minute ago must still be
 * readable, and one you abandoned twenty minutes ago must visibly not be.
 *
 * The times double. A linear ramp would spend its whole range on the first minute and
 * then say nothing for the next twenty; doubling puts a distinguishable step at every
 * order of magnitude of neglect, which is the quantity being displayed.
 */
export const BLEACH_BANDS: readonly BleachBand[] = [
  { afterMs: 0, cell: CELL, level: 0 },
  { afterMs: 30_000, cell: CELL, level: 4 },
  { afterMs: 60_000, cell: CELL, level: 8 },
  { afterMs: 120_000, cell: COARSE_CELL, level: 40 },
  { afterMs: 240_000, cell: COARSE_CELL, level: 52 },
]

/** Which band a window that has been unfocused for `ms` is in. */
export function bleachBandFor(ms: number): number {
  let band = 0
  for (let i = 0; i < BLEACH_BANDS.length; i++) {
    if (ms >= BLEACH_BANDS[i]!.afterMs) band = i
  }
  return band
}
