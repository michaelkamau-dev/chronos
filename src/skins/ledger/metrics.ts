/**
 * Ledger (2035) — authored chrome metrics.
 *
 * The other five eras measure a vendor's pixels. This one has none: it is the only
 * invented era in Chronos, and ARCHITECTURE.md §8 is its specification the way the
 * Luna guidelines and the Macintosh HIG are the others'. §8's own words: "It gets an
 * authored spec sheet — the one place in Chronos where a number is normative because
 * I wrote it rather than uncertain because I found it."
 *
 * So the provenance levels here mean something different from every other skin, and
 * `authored` was added to `ProvenanceLevel` to carry that difference rather than
 * hide it inside `derived`:
 *
 * - **`authored`** — §8 states this value. There are seven: the 40px gutter, the
 *   ~400ms suspend delay, the 1Hz idle refresh, the 0.5Hz cursor, the three inks,
 *   the ordered-Bayer mechanism, and the title bar's cost format.
 * - **`derived`** — §8 does not state it, and it follows by arithmetic from something
 *   §8 does. The derivation is in the note, every time. This is most of the table.
 * - **`unverified`** — reserved for a value that is neither, and there is exactly one.
 *
 * Nothing here is `documented` or `measured`, and that is the honest shape: there is
 * no document outside §8 and there are no pixels to measure.
 *
 * ### The one rule that generates most of the geometry
 *
 * **Every box dimension is a multiple of the dither cell, and no stroke is thinner
 * than one.** Both fall out of §8's "tone comes from ordered dither" rather than from
 * taste:
 *
 * - A tone boundary off the cell grid puts two dithered surfaces out of phase and the
 *   seam between them reads as a defect in the pattern.
 * - A rule thinner than the cell is a thin stroke, and §8's reason for the heavy type
 *   — "thin strokes do not survive dithering" — applies to a 2px rule exactly as it
 *   applies to a 2px stem. So Ledger has no hairlines. Every rule is 4px.
 *
 * `test/browser/ledger-fidelity.spec.ts` asserts the multiple-of-cell rule over this
 * whole table, so a future value that breaks it fails rather than looking fine.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'
import { CELL } from './dither.js'

const SPEC = 'docs/ARCHITECTURE.md §8, "The 2035 era — Ledger".'

const GRID =
  'Multiple of the 4px dither cell, per the grid rule in this file\'s header: a tone '
  + 'boundary off the cell grid puts two dithered surfaces out of phase.'

/**
 * The type, and the number the whole geometry hangs off.
 *
 * §8 states the face as a category and its reason as physics — "Type is heavy. Thin
 * strokes do not survive dithering, so Ledger's face is a chunky grotesque at generous
 * sizes. The physics picks the type, not taste." `tools/font-compare/ledger-publicsans.mjs`
 * turns that into a gate and runs it: a stroke is severed when every one of its Bayer
 * columns falls below the threshold, each Bayer row keeps one value at or above 10, so
 * a run one cell wide covers all four residues and cannot be severed at any level this
 * era uses. The gate is `stem >= cell`, and Public Sans Black first reaches a 4px
 * rasterised stem at **18px**.
 *
 * The same sweep rejects Public Sans *Bold*, which does not reach a 4px stem until
 * 26px — which is what settles empirically that §8's "type is heavy" means Black
 * rather than merely bold, instead of leaving it to taste.
 */
export const FONT = {
  /** The one chrome size. */
  size: 18,
  /** The one larger size, for the Steward's proposition and the running total. */
  large: 24,
  /**
   * 24px, six cells. The 18px face needs about 22px of line box; 24 is the next cell
   * multiple and leaves the cap band centred on whole pixels.
   */
  line: 24,
  /** Public Sans Black at 18px: 1446/2000 em, which rasterises to 13px. */
  capHeight: 13,
  /** The rasterised stem at 18px, and the reason 18px is the size. */
  stem: 4,
} as const

/**
 * The three inks.
 *
 * §8 names them in words — "paper white, carbon black, and one amber ink. Thermal-receipt
 * palette — institutional, cheap, unglamorous" — and gives no values. These are the
 * values, signed off against that sentence.
 *
 * Neither end is neutral, deliberately. Thermal print is a warm dark on warm stock, and
 * `#000` on `#FFF` would be a screen palette wearing a paper name. The amber is dark
 * enough to carry text rather than only fills, which it has to be: it marks every
 * rounded-up cost in the gutter and every voided line in a menu.
 */
export const INK = {
  paper: '#F2EFE6',
  carbon: '#1B1714',
  amber: '#C25E00',
} as const

/**
 * The cost gutter.
 *
 * §8's compromise, and the era's deliberate mistake: "a permanent 40px itemised strip
 * down the right edge of *every window*, showing joules, model calls and elapsed time
 * as running ledger lines. It cannot be hidden — it is a regulatory disclosure, not a
 * preference. It makes every layout in the OS 40px narrower than it wants to be."
 *
 * The 40 is authored. Everything else here is derived from it, and the derivation is
 * the nicest thing in this era because it explains a behaviour §8 states without
 * explaining: **the rounding-up is a consequence of the column width.** Forty pixels
 * less the 4px rule leaves 36, and 36px of 18px Public Sans Black holds three glyphs
 * and no more. So every value is squeezed to three characters, which means every value
 * is rounded — and §8's "the OS rounds every cost up and tells you it did, in the
 * gutter, every time" is what a machine does when its disclosure column is too narrow
 * for its own numbers. Petty and bureaucratic, exactly as specified, and now for a
 * reason rather than as a flourish.
 *
 * The mark is `+`, and that was decided by coverage before any chrome was built rather
 * than after a test caught it. `▲` U+25B2 is the obvious glyph for "rounded up" and
 * Public Sans does not carry it; a missing glyph falls back to the browser's default
 * face, whose fractional advance takes every glyph after it off the pixel grid. That is
 * the ChiKareGo2 lesson applied in advance.
 */
export const GUTTER = {
  /** §8, stated. */
  width: 40,
  /** Value row plus unit row, both one line box. */
  entryHeight: FONT.line * 2,
  /** Characters a value may occupy before it is rounded to fit. */
  valueChars: 3,
  /** The rounded-up mark. `+`, because U+25B2 is not in the face. */
  roundedMark: '+',
} as const

/**
 * The bleach clock.
 *
 * §8: "Everything else is suspended to a bitmap within about 400ms of losing focus."
 * The word is "about", so 400 is authored with the tolerance §8 gave it.
 */
export const SUSPEND_AFTER_MS = 400

/**
 * The refresh band and the burst.
 *
 * §8: "The screen refreshes at 1Hz while you read, in a visible horizontal band like
 * e-ink. Typing forces a burst mode that looks and behaves differently — and ticks the
 * gutter. The cursor blinks at 0.5Hz."
 *
 * Three things follow rather than being chosen:
 *
 * - **The band steps; it does not sweep.** At 1Hz the governor delivers one frame per
 *   second, so the band can only be drawn once per second — it moves one band-height
 *   per delivered frame. That is what a slow panel doing partial refreshes looks like,
 *   and it makes the band a direct readout of the governor: one delivered frame, one
 *   step. Under burst it moves every frame and reads as a fast sweep, which is §8's
 *   "looks and behaves differently" without needing a second mechanism.
 * - **The cursor is every other delivered frame.** 0.5Hz against a 1Hz refresh is
 *   `index % 2`, so the two authored rates give the blink for free rather than needing
 *   a timer of its own.
 * - **Burst is the display's own rate**, not a third number. §8 says typing forces
 *   burst and burst ticks the gutter; running at the panel's rate is what makes the
 *   cost visibly climb while you type, which is the entire thesis arriving on the one
 *   surface where you cannot ignore it.
 */
export const REFRESH = {
  idleHz: 1,
  /** null = the display's own rate. */
  burstHz: null,
  /** Derived from SUSPEND_AFTER_MS: the same window the machine calls you active. */
  burstMs: SUSPEND_AFTER_MS,
  /** 16 cells. Large enough to read as a band rather than a line. */
  bandHeight: 64,
} as const

/** The budget bar, the Steward, and the controls. */
export const SHELL = {
  /** 12 cells: a 4px rule plus a 32px control row plus 12px of clearance. */
  barHeight: 48,
  /** Every rule in the era, because a rule thinner than a cell is a thin stroke. */
  rule: CELL,
  /** One line box plus 4px either side. */
  controlHeight: 32,
  /** 3 cells of padding either side of a button label. */
  controlPad: 12,
  /**
   * §8: the defer control "is deliberately the smallest target on screen". Three
   * cells square. It keeps a full-size keyboard path — see shell.ts.
   */
  deferSize: 12,
  /** The Steward's window, in cell multiples. */
  stewardSize: { w: 480, h: 192 },
} as const

export const LEDGER_METRICS: ChromeMetrics = {
  /** 8 cells: 4px of clearance, a 24px line box, 4px of clearance. */
  titleBarHeight: 32,
  /**
   * Unchanged when inactive. This era says nothing with caption styling — an
   * unfocused window bleaches instead, which carries how long it has been ignored
   * rather than merely that it is not frontmost.
   */
  titleBarHeightInactive: 32,
  /**
   * `top` is 0 because the frame's top edge is the title bar's own first rows, the
   * convention every skin here uses. `right` is the 4px frame line **plus the 40px
   * cost gutter**: the gutter is chrome, so declaring it as border is what makes the
   * window manager subtract it from the content area and makes §8's "every layout in
   * the OS 40px narrower than it wants to be" true through the existing contract
   * rather than through an addition to it.
   */
  border: insets(0, 44, 4, 4),
  /** Square. A printed receipt has no rounded corners and this era has no depth. */
  cornerTop: { kind: 'radius', px: 0 },
  resizeGrab: CELL,
  /** None. A drop shadow is a depth cue, and a two-ink thermal surface has no depth. */
  shadowInsets: insets(0, 0, 0, 0),
  /** One title bar: the smallest step that leaves a whole caption visible. */
  cascadeStep: 32,
  /** The gutter plus the frame line — see the provenance note, which is precise
   *  about what this does and does not guarantee. */
  dragGrabMargin: 44,
  maximizeSemantics: 'fill',
  /**
   * `shrink`. Minimizing is the one unambiguously thrifty act available in an OS that
   * bills for rendering: a suspended window still costs a surface, and a minimized one
   * costs nothing. It shrinks toward its tile in the budget bar, which owns the target.
   */
  minimizeStyle: 'shrink',
}

export const LEDGER_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: {
    level: 'derived',
    source: SPEC,
    note: '32px = 4 + 24 + 4. The 24px line box is FONT.line, itself derived from the '
      + '18px size the face gate produced; 4px of clearance either side is one cell. '
      + `${GRID}`,
  },
  titleBarHeightInactive: {
    level: 'derived',
    source: SPEC,
    note: 'Equal to the active height. §8 replaces inactive-caption styling outright: '
      + '"Suspended windows fade like thermal paper ... This replaces '
      + 'inactive-title-bar styling with something that carries real information." A '
      + 'height change would be a second, redundant inactive signal.',
  },
  border: {
    level: 'authored',
    source: SPEC,
    note: 'The 40px gutter is §8, stated. The 4px frame line is derived: it is one '
      + 'cell, and the no-hairlines rule means a frame cannot be thinner. right = '
      + '4 + 40 = 44. top = 0 by the frame convention shared with the other skins.',
  },
  cornerTop: {
    level: 'derived',
    source: SPEC,
    note: 'Radius 0. §8 gives this era no depth model — no shadow, no bevel, nothing '
      + 'animates — and its surface is a printed receipt. There is nothing for a '
      + 'corner radius to be a cue for, and a curve would break the dither tile along '
      + 'its arc.',
  },
  resizeGrab: {
    level: 'derived',
    source: SPEC,
    note: 'One cell. The frame is 4px, which is already grabbable, so the slop only '
      + 'has to cover the pointer landing one cell outside it.',
  },
  shadowInsets: {
    level: 'derived',
    source: SPEC,
    note: 'Zero on every side. §8 specifies a flat two-ink thermal surface with no '
      + 'depth cues; a drop shadow would also have to be dithered, and a dithered '
      + 'shadow is a texture rather than a shadow.',
  },
  cascadeStep: {
    level: 'derived',
    source: SPEC,
    note: 'Equal to titleBarHeight, which is the smallest offset that leaves the whole '
      + 'caption of the window beneath visible. Same derivation System 1 uses, on a '
      + 'different caption height.',
  },
  dragGrabMargin: {
    level: 'derived',
    source: SPEC,
    note: '44px = the gutter plus the frame line, so that dragging a window off the '
      + 'LEFT edge cannot push its cost disclosure out of view — §8 makes the gutter '
      + 'non-optional, and a window draggable until its disclosure is off-screen would '
      + 'defeat that. Stated precisely because it is one-sided: geometry.ts applies '
      + 'grabMargin symmetrically, so dragging off the RIGHT edge still takes the '
      + 'gutter with it. This is a bound in one direction, not a guarantee in both.',
  },
  maximizeSemantics: {
    level: 'derived',
    source: SPEC,
    note: '"fill". §8 keeps direct manipulation intact — "Windows still overlap, '
      + 'stack, drag and resize" — and names no zoom-style gesture, so the era takes '
      + 'the ordinary rectangular fill rather than the classic-Mac content zoom.',
  },
  minimizeStyle: {
    level: 'derived',
    source: SPEC,
    note: '"shrink", toward a tile in the budget bar. Derived from the premise rather '
      + 'than from an appearance: §8\'s scarce resource is joules, an unfocused window '
      + 'still costs a surface to composite, and minimizing is the only act that takes '
      + 'that cost to zero. An era about rationing that could not put a window away '
      + 'would be missing its own thriftiest gesture. The animation itself is a cut — '
      + 'see chrome.ts, and §8: "Nothing animates."',
  },
}

/**
 * The one value here that is neither stated nor derived.
 *
 * Kept out of `LEDGER_METRICS` because it is not a window-manager metric, and recorded
 * here rather than left implicit: §8 says the Steward "interrupts" and that its
 * proposition is *"You haven't touched Untitled 3 in 20 minutes. Shall I settle it?"*,
 * which fixes the *wording* of the threshold at twenty minutes but says nothing about
 * how often the Steward asks again after being deferred. Twenty minutes is therefore
 * authored; the re-ask interval is not, and it is not derivable from anything §8 says.
 */
export const STEWARD = {
  /** §8 states this inside the Steward's own line of dialogue. */
  idleMinutes: 20,
  /**
   * How long a defer lasts. Unverified: §8 says the Steward "can be deferred but not
   * disabled" and gives no interval. Five minutes is short enough to stay a nuisance,
   * which is the specified character, but it is not §8's number.
   */
  deferMinutes: 5,
} as const

export const STEWARD_PROVENANCE = {
  idleMinutes: {
    level: 'authored' as const,
    source: SPEC,
    note: 'Stated inside §8\'s own example line: "You haven\'t touched Untitled 3 in '
      + '20 minutes. Shall I settle it?"',
  },
  deferMinutes: {
    level: 'unverified' as const,
    source: SPEC,
    note: '§8 states that the Steward can be deferred and not disabled, and gives no '
      + 're-ask interval. Nothing in §8 determines one, so this is chosen rather than '
      + 'derived, and it is marked so rather than dressed as a derivation.',
  },
}
