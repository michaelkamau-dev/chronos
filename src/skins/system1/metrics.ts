/**
 * Macintosh System 1 (1984) — measured chrome metrics.
 *
 * Source: the *Macintosh Human Interface Guidelines* in `docs/sources/`, both its
 * prose and its embedded figures. Reproduce every number here with
 * `python3 tools/pdf-extract/measure-mac-system1.py docs/sources/figures`, and
 * re-extract the figures with `tools/pdf-extract/extract-mac-figures.py`.
 *
 * **Why this era ends up better sourced than XP or Tiger.** The HIG embeds its screen
 * shots as PNG XObjects, and several are *pure two-colour bitmaps* — one of them
 * 512x342, which is exactly the framebuffer of a Macintosh 128K / 512K / Plus. A
 * two-tone 512x342 image cannot have been resampled: any scale introduces a third
 * value, and there is none. So no calibration argument is needed. These are Apple's
 * own pixels, at 1:1, in the bit depth System 1 actually ran at. The XP and Tiger
 * figures were JPEG and both needed an argument; this one does not.
 *
 * **Era caveat, kept rather than glossed.** `macintosh-hig.pdf` is the 1992 edition
 * and describes System 7. The `documentProc` chrome was visually unchanged from 1984
 * through System 6, and its 19px title bar is independently in Apple's shipped
 * `StandardWDEF.a` as `minTitleH EQU 19`, so the geometry carries back. Where a
 * feature is *later* than System 1 it is called out and omitted: the zoom box arrives
 * with `zoomDocProc` in 1987 and this era has none.
 *
 * Four things here contradict what a classic-Mac recreation usually produces:
 *
 * 1. **Disabled text is a 50% checkerboard knocked out of the drawn glyph** —
 *    Apple's `notPatBic`. Proven by parity rather than by eye: the File menu's
 *    disabled `Revert` is 77 ink pixels with **all 77 on one `(x + y)` parity**,
 *    while `Save As...` beside it is 179 split 91/88. The identical discriminator
 *    `tools/captures/measure-win31.py` runs on Microsoft's `GrayString`.
 * 2. **An inactive window loses its controls rather than dimming them.** No racing
 *    stripes, no close box, no size box, and the scroll bars reduced to their outer
 *    outline. The HIG states it in prose (p164) and shows it in a figure.
 * 3. **The scroll bar track is a 25% pattern, not 50%.** QuickDraw's `ltGray`, on a
 *    4x2 cell. The desktop is the 50% one. Measured: 25.2% and 50.0%.
 * 4. **The scroll box is a fixed 16px, filling the 14px track interior.**
 *    Proportional thumbs are a later Platinum feature.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'

const SCREEN =
  'Macintosh HIG p105, a 512x342 two-colour screen bitmap — the framebuffer of a '
  + 'Macintosh 128K/512K/Plus at 1:1. docs/sources/figures/mac-hig-screen-512x342.png.'

const DIALOG =
  'Macintosh HIG p204, a 1-bit document-style frame on a white page. '
  + 'docs/sources/figures/mac-hig-modeless-dialog.png.'

const MENU =
  'Macintosh HIG p87, the File menu with Revert disabled. '
  + 'docs/sources/figures/mac-hig-file-menu.png.'

const GREY =
  'Macintosh HIG p179, a 640x480 System 7 screen dump on a solid grey desktop, which '
  + 'is what makes the drop-shadow corners readable. '
  + 'docs/sources/figures/mac-hig-window-on-grey.png.'

const PROSE = 'Macintosh Human Interface Guidelines (Apple, 1992), stated in prose.'

export const SYSTEM1_METRICS: ChromeMetrics = {
  /**
   * Measured four times — the 1-bit dialog frame, the slider window, the 512x342
   * screen and the grey-desktop dump — and stated twice in Apple's prose (HIG p162,
   * restated in the Platinum addendum p103). Also `minTitleH EQU 19` in
   * `StandardWDEF.a`.
   *
   * It decomposes exactly: 1px frame line + 1px + a 16px Chicago 12 cell + the 1px
   * rule under the caption.
   */
  titleBarHeight: 19,
  /** Unchanged when inactive. What changes is that the stripes and controls vanish. */
  titleBarHeightInactive: 19,
  /**
   * Asymmetric, and this is the era's signature: **1px on the left and top, 2px on
   * the right and bottom.** The second pixel is a hard 1px drop shadow — the frame's
   * right column and bottom row translated (+1, +1) — so the top-right and
   * bottom-left corners are notched by one pixel. `top` is 0 because the frame's top
   * line is the title bar's first row, the same convention XP's metrics use.
   */
  border: insets(0, 2, 2, 1),
  /** Square. Rounded window corners are three eras away. */
  cornerTop: { kind: 'radius', px: 0 },
  /** The visible border is 1px, so the grab region has to be slop rather than frame. */
  resizeGrab: 4,
  /** The 1px shadow on the right and bottom is painted but must not be hit-tested. */
  shadowInsets: insets(0, 1, 1, 0),
  cascadeStep: 20,
  dragGrabMargin: 48,
  /**
   * System 1 has **no** maximize gesture of any kind: `documentProc` carries no zoom
   * box, and zoom arrives with `zoomDocProc` in 1987. This is the declaration that
   * makes the window manager refuse the command rather than the skin merely omitting
   * a button — see the note on `MaximizeSemantics` in core/wm/types.ts.
   */
  maximizeSemantics: 'none',
  /** No minimize either. MultiFinder is three years away; the skin emits no button. */
  minimizeStyle: 'none',
}

export const SYSTEM1_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: {
    level: 'documented',
    source: `${PROSE} p162: "make sure the title bar is at least 19 pixels high, the `
      + `height of a document window title bar." Measured independently on four `
      + `figures. ${DIALOG}`,
  },
  titleBarHeightInactive: {
    level: 'documented',
    source: `${PROSE} p164: "The close box, zoom box, size box, scroll box, and `
      + `stripes in the title bar disappear." The height is not among what changes.`,
  },
  border: {
    level: 'measured',
    source: GREY,
    note: 'Frame (48,42)-(393,265); shadow column x=394 rows 43..266 and shadow row '
      + 'y=266 columns 49..394 — the frame edges translated (+1, +1), so both '
      + 'corners are notched 1px. Confirmed on the second 640x480 dump. The two '
      + 'book-cropped 1-bit figures each differ by one pixel at the bottom-left '
      + '(0px and 2px), and the 512x342 screen cannot settle that corner at all '
      + 'because the desktop checkerboard parity paints the same pixel. Recorded '
      + 'rather than smoothed: the two genuine screen dumps agree and are what ships.',
  },
  cornerTop: {
    level: 'measured',
    source: DIALOG,
    note: 'All four corners of the frame rectangle are square; only the shadow is '
      + 'inset. The screen itself has rounded corners (insets 2,1,0) and those are '
      + 'the display, not the window.',
  },
  resizeGrab: {
    level: 'derived',
    source: 'Set to 4px because the visible frame is 1px. Sizing from a 1px line '
      + 'would be unusable, and the era sized from the grow box rather than from the '
      + 'border, so there is no measurement to inherit here.',
  },
  shadowInsets: {
    level: 'measured',
    source: GREY,
    note: '1px on the right and bottom, 0 on the left and top. Unlike XP, where zero '
      + 'was the finding, here the shadow is real and asymmetric.',
  },
  cascadeStep: {
    level: 'derived',
    source: 'Derived from the measured 19px title bar: 20px is the smallest step that '
      + 'keeps each window\'s whole title bar and its frame line visible.',
    note: 'The HIG discusses default window position at length (p171) and states no '
      + 'cascade offset, and a cascade cannot be measured from a static figure. The '
      + 'derivation is stated so it is not mistaken for a measurement.',
  },
  dragGrabMargin: {
    level: 'unverified',
    source: `${PROSE} p179`,
    note: 'The requirement is documented — "don\'t allow users to move windows '
      + 'completely off the screen" — but no pixel count is given and none is '
      + 'measurable from a still. 48px satisfies the requirement; it is not Apple\'s '
      + 'number.',
  },
  maximizeSemantics: {
    level: 'documented',
    source: `${PROSE} p158 lists the standard document window controls; the zoom box `
      + `is described at p192 as a System 7 control. Apple's shipped documentProc has `
      + `no zoom box, and zoomDocProc arrives in 1987.`,
    note: 'A knowing omission rather than an anachronism: the era gets no zoom, and '
      + 'the window manager refuses the command so nothing can reach one.',
  },
  minimizeStyle: {
    level: 'documented',
    source: `${PROSE} p158. System 1 is single-tasking; there is no minimize, no '
      + 'collapse and no application switching until MultiFinder in 1987.`,
    note: 'ARCHITECTURE.md §12 conflict 1 settles this: the button is omitted rather '
      + 'than invented, and window cycling lives on a Chronos-neutral chord.',
  },
}

/**
 * A 1-bit bitmap, as rows of `#` (ink) and `.` (paper).
 *
 * These are transcribed from the figures pixel for pixel because no Chicago
 * substitute carries any of them — the checkmark, the command symbol, the submenu
 * triangle and the grow icon are all missing from every candidate face measured. A
 * font glyph would be the wrong answer anyway: `index.ts` turns each of these into a
 * `box-shadow` list, so every pixel lands on the era's grid by construction.
 */
export type Bitmap = readonly string[]

/** Menu item checkmark, 9x8. Measured at x=156, y=70 on the 512x342 screen. */
const CHECKMARK: Bitmap = [
  '........#',
  '.......##',
  '......##.',
  '.....##..',
  '#...##...',
  '##.##....',
  '.###.....',
  '..#......',
]

/** Submenu indicator, 6x11, solid, pointing right. Measured at x=272, y=25. */
const SUBMENU_ARROW: Bitmap = [
  '#.....',
  '##....',
  '###...',
  '####..',
  '#####.',
  '######',
  '#####.',
  '####..',
  '###...',
  '##....',
  '#.....',
]

/**
 * The command symbol, 9x9, measured at x=129 in the File menu.
 *
 * Not in any candidate face: `U+2318` is absent from ChiKareGo2, FA Sysfont C and
 * ChicagoFLF, and present-but-off-the-pixel-grid in Chicago Kare.
 */
const COMMAND: Bitmap = [
  '.##...##.',
  '#..#.#..#',
  '#..#.#..#',
  '.#######.',
  '...#.#...',
  '.#######.',
  '#..#.#..#',
  '#..#.#..#',
  '.##...##.',
]

/**
 * The grow (size) icon, 11x11, measured at x=421, y=315 inside the 16x16 size box.
 *
 * Two overlapping square outlines — a 7x7 at the top left drawn *over* a 9x9 offset
 * (2, 2) — which is why the larger square's top-left edges are missing: the smaller
 * one's white fill covers them.
 */
const GROW_ICON: Bitmap = [
  '#######....',
  '#.....#....',
  '#.....#####',
  '#.....#...#',
  '#.....#...#',
  '#.....#...#',
  '#######...#',
  '..#.......#',
  '..#.......#',
  '..#.......#',
  '..#########',
]

/**
 * The checkbox mark, inside the 12x12 frame. Measured on the HIG's checkbox figure.
 *
 * The HIG's words are "an x appears in the box" (p235), and the x is drawn corner to
 * corner from the inside of the frame rather than as a small centred mark.
 */
const CHECKBOX_X: Bitmap = [
  '#........#',
  '.#......#.',
  '..#....#..',
  '...#..#...',
  '....##....',
  '....##....',
  '...#..#...',
  '..#....#..',
  '.#......#.',
  '#........#',
]

/**
 * The scroll arrow, 12x10, and the two chrome squares.
 *
 * Measured from the vertical scroll bar's up arrow at x=420, y=47 on the 512x342
 * screen: an outlined arrow, white inside, which inverts when pressed. Most
 * recreations draw a solid triangle.
 */
const SCROLL_ARROW_UP: Bitmap = [
  '.....##.....',
  '....#..#....',
  '...#....#...',
  '..#......#..',
  '.#........#.',
  '####....####',
  '...#....#...',
  '...#....#...',
  '...#....#...',
  '...######...',
]

/**
 * Colours, control geometry and text rendering beyond what the WM needs.
 *
 * There are two colours in this era and no others. Every tone is a dither of them,
 * which is the reason the viewport must scale by a whole number: a 1px checkerboard
 * at a fractional scale averages into the flat grey it exists to disprove.
 */
export const SYSTEM1 = {
  palette: {
    ink: '#000000',
    paper: '#FFFFFF',
  },

  /** The screen: a 1px black border with 2px rounded corners, over a 50% desktop. */
  screen: { border: 1, cornerInsets: [2, 1, 0] as const, width: 512, height: 342 },

  /**
   * The desktop is a **1px 50% checkerboard**, not a flat grey. Measured over a clear
   * 41x81 region: 1661 ink pixels of 3321, and every one on the same `(x + y)`
   * parity. Same construction as the disabled-text knockout, one era before Windows
   * converged on it.
   */
  desktopPattern: { mode: 'checkerboard', cell: 1 },

  titleBar: {
    height: 19,
    /** Six stripes on rows 4..14, 1px on / 1px off, spanning left+2 .. right-2. */
    stripeTop: 4,
    stripeCount: 6,
    stripeInset: 2,
    /** The text's 16px cell begins 2px below the frame's top line. */
    textCellTop: 2,
    /**
     * The stripes stop this far from the title's ink on each side. The erased zone is
     * the string width plus 12, centred — measured 145px of clearance around 132px of
     * ink, and 62px around 50px on a second figure.
     */
    textClearance: 6,
  },

  /** 11x11 hollow square, 9px in from the frame's left line, on the stripe rows. */
  closeBox: { size: 11, inset: 9 },

  /** The scroll bars' intersection, and the 11x11 icon inside it. */
  sizeBox: { size: 16, iconInset: { left: 3, top: 3 } },

  /**
   * 16px wide including its own 1px left border and the window's 1px frame line,
   * so its interior is 14px. The HIG calls it "a light gray rectangle" (p182) and
   * the measurement agrees: QuickDraw `ltGray`, a 25% pattern on a 4x2 cell.
   */
  scrollBar: {
    width: 16,
    arrowBox: 16,
    /** Fixed. Proportional thumbs are a Platinum feature. */
    thumb: 16,
    troughPattern: { mode: 'ltGray', cellX: 4, cellY: 2 },
  },

  /** Roman script. Documented in Inside Macintosh and measured twice here. */
  menuBar: { height: 20, rule: 1 },

  menu: {
    /** 1px black frame, plus a 1px black shadow offset (+1, +1) like the window's. */
    border: 1,
    shadow: 1,
    /** Confirmed nine times over: every item's cap top is exactly box + 3. */
    itemHeight: 16,
    capTop: 3,
    /**
     * A separator is a full 16px item whose 9th row carries a 1px 50% pattern
     * spanning the menu's whole interior width. Derived exactly: nine items plus
     * three separators at 16px is 192px, against a measured 192px interior.
     */
    separatorRule: 8,
    /**
     * All four gutters are measured **from the border line**, which is what the
     * figures show directly: the checkmark's left edge sits at border + 4 and the
     * label's ink at border + 16, on both the File menu and the Format menu.
     */
    markInset: 4,
    labelInset: 16,
    /** The command symbol's column, measured from the menu's right border line. */
    accelInset: 23,
    /** The key letter follows the command symbol by this much. */
    accelLetterOffset: 11,
    /** Submenu arrow's right edge, from the right border line. */
    submenuInset: 8,
  },

  /**
   * 59x20 with a 3-row corner arc.
   *
   * Both dimensions are Apple's prose — "the standard width for OK and Cancel buttons
   * is 59 pixels" (p228) and "Standard button height is 20 pixels" (p229) — and both
   * measure exactly that in the figure. The corner is a hand-drawn 3-row arc with
   * x-insets 3,1,1, not a radius, the same category of fact as XP's 1px indent.
   */
  button: {
    width: 59,
    height: 20,
    cornerInsets: [3, 1, 1] as const,
    /** Documented minimum, p380: "a minimum of 8 pixels on each side of the text". */
    textPadding: 8,
    /** Documented, p230: "three black pixels, separated by a border of one white". */
    ringWidth: 3,
    ringGap: 1,
    ringCornerInsets: [5, 3, 2, 1, 1, 0] as const,
  },

  /** A plain rectangle. Measured 22px tall with a 1px black frame. */
  textBox: { border: 1, height: 22 },

  /** 12x12, measured five times in one figure and once in another. */
  checkSize: 12,

  /**
   * The five interactive states, in this era's own terms.
   *
   * `pressed` is **inversion**, documented rather than chosen: "the button highlights
   * (inverts) to give visual feedback" (p229), and the button "stays inverted until
   * the user releases the mouse button or moves the pointer away". A 1-bit display
   * has no other way to show a press.
   *
   * `hover` is the honest gap. System 1 tracked no hover — there was nothing to
   * render it with and no era-correct value to copy. The skin gives it the smallest
   * real change that is not a colour: the pointer becomes an arrow over chrome, and
   * the state is otherwise identical to rest. Recorded as an era absence rather than
   * filled in.
   */
  pressed: { mode: 'invert' },

  /**
   * Disabled text: a 50% checkerboard knocked out of the drawn glyph.
   *
   * Apple's `notPatBic`: draw the text, then AND a 50% gray pattern against it, so
   * ink is *removed* in a checkerboard rather than replaced by a lighter colour. On a
   * 1-bit display there is no lighter black, so this is the only construction
   * available — which is why Windows 3.1 independently arrived at the same one eight
   * years later, and why Windows 95 abandoned it the moment 8-bit colour was assumed.
   *
   * Proven by parity on Apple's own pixels: `Revert` is 77 ink pixels with 77 on one
   * `(x + y)` parity; `Save As...` beside it is 179 split 91/88.
   *
   * The implementation is Windows 3.1's, unchanged — an `::after` layer painting a
   * checkerboard of the *background* colour over the glyph. CSS cannot knock a
   * pattern out of live text, and a `mask` on the element would stipple the frame
   * along with the label. See DECISIONS.md 4.12.
   */
  disabledText: { mode: 'checkerboard', cell: 1 },

  /**
   * Chicago 12, and what a substitute has to reproduce.
   *
   * A 16px cell: ascent 12 + descent 3 + leading 1. The cap top sits at cell + 3 and
   * the baseline at cell + 11, which is what makes the 19px title bar and the 20px
   * menu bar decompose exactly.
   *
   * `ink` is the ink width of a whole string, because ink is what a bitmap capture
   * shows; `advance` is per glyph, from ink-start deltas in the File menu.
   */
  font: {
    cell: 16,
    capHeight: 9,
    descender: 3,
    ascent: 12,
    baseline: 11,
    target: {
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
    },
  },

  /** Every chrome glyph the era draws, as measured bitmaps. */
  glyphs: {
    checkmark: CHECKMARK,
    submenuArrow: SUBMENU_ARROW,
    command: COMMAND,
    growIcon: GROW_ICON,
    checkboxX: CHECKBOX_X,
    scrollArrowUp: SCROLL_ARROW_UP,
  },
} as const

export const SYSTEM1_PROVENANCE_EXTRA = {
  palette: {
    level: 'measured',
    source: SCREEN,
    note: 'Two values and no others, which is what makes the 512x342 figure provably '
      + 'unresampled and the era provably dithered rather than shaded.',
  },
  screen: { level: 'measured', source: SCREEN },
  desktopPattern: {
    level: 'measured',
    source: SCREEN,
    note: '50.0% ink with every pixel on one (x + y) parity over a clear 41x81 region.',
  },
  titleBar: { level: 'measured', source: DIALOG },
  closeBox: {
    level: 'measured',
    source: DIALOG,
    note: '11x11 at frame+9, confirmed on the 512x342 screen (x=16 against a frame '
      + 'line at x=7) and on the modeless dialog (x=9 against x=0).',
  },
  sizeBox: { level: 'measured', source: SCREEN },
  scrollBar: {
    level: 'measured',
    source: SCREEN,
    note: 'Trough measured 25.2% ink concentrated in the (x%4, y%2) cells (0,0) and '
      + '(2,1) — QuickDraw ltGray exactly. The HIG independently calls the scroll bar '
      + '"a light gray rectangle" (p182).',
  },
  menuBar: {
    level: 'documented',
    source: `${PROSE} Chapter 4, and Inside Macintosh's MBarHeight for the Roman `
      + `script. Measured at 20px including its 1px rule on two figures.`,
  },
  menu: {
    level: 'measured',
    source: MENU,
    note: 'The interior closes exactly: nine items plus three separators at 16px is '
      + '192px against a measured 192px, and all nine cap tops land on box + 3.',
  },
  button: {
    level: 'documented',
    source: `${PROSE} p228 (59px wide), p229 (20px tall), p230 (the 3px ring with a `
      + `1px white gap), p380 (>=8px text padding each side). ${DIALOG} measures all `
      + `four.`,
  },
  textBox: {
    level: 'measured',
    source: 'Macintosh HIG p243, the Save dialog\'s name field.',
    note: 'The HIG calls it "typically a rectangular box" and gives no dimensions; '
      + '22px is measured from that figure alone.',
  },
  checkSize: {
    level: 'measured',
    source: 'Macintosh HIG p236 (five boxes) and p237 (one).',
    note: '12x12 in all six. The radio button is the same 12x12 square envelope; the '
      + 'HIG documents its mark as "a dot in the middle" (p234) but the dot\'s exact '
      + 'bitmap was not isolable from any figure, so the skin draws a centred dot and '
      + 'that shape alone is unverified.',
  },
  pressed: {
    level: 'documented',
    source: `${PROSE} p229: "the button highlights (inverts)". Also p284, on `
      + `highlighting generally: "reversing the background with the foreground".`,
  },
  disabledText: {
    level: 'measured',
    source: MENU,
    note: 'Parity: Revert 77 ink pixels, 77 on one parity, 0 on the other; Save As... '
      + '179 split 91/88; Save 108 split 56/52; Quit 181 split 91/90.',
  },
  font: {
    level: 'measured',
    source: `${DIALOG} and ${MENU}`,
    note: 'Resolved to ChiKareGo2 — see docs/eras/system1.md and '
      + 'src/skins/system1/fonts/LICENCES.md. Two glyph advances diverge by 1px (N '
      + 'and r) and that is recorded as a stated loss.',
  },
  glyphs: {
    level: 'measured',
    source: `${SCREEN} and ${MENU}`,
    note: 'Transcribed pixel for pixel. None of the four candidate faces carries the '
      + 'checkmark, the command symbol or the arrows on the pixel grid, so these are '
      + 'drawn rather than typeset.',
  },
} as const satisfies Record<keyof typeof SYSTEM1, { level: string; source: string; note?: string }>
