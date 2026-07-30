/**
 * The Macintosh System 1 skin manifest.
 *
 * The third era, and the first one whose contract pressure was structural rather than
 * cosmetic. Three things it does that neither Windows era needed:
 *
 * - **No maximize gesture of any kind.** `documentProc` carries no zoom box and
 *   `zoomDocProc` is three years away, so `maximizeSemantics` is `'none'` and the
 *   window manager refuses the command. That value did not exist before this era;
 *   see the note on `MaximizeSemantics` in `core/wm/types.ts`.
 * - **Chrome that disappears when a window goes inactive**, rather than dimming. The
 *   racing stripes, close box and size box are all gone on `data-state="blurred"`,
 *   which is Apple's own specification (HIG p164) and is done entirely in CSS.
 * - **Every chrome glyph is a measured bitmap**, not a font character. No Chicago
 *   substitute that holds the pixel grid carries the checkmark, the command symbol or
 *   the arrows, so `pixelShadow` turns the transcribed bitmaps in metrics.ts into
 *   `box-shadow` lists. They use `currentColor`, so a highlighted menu item inverts
 *   its glyphs along with its text for free — which is what inversion means on a
 *   1-bit display.
 *
 * As with XP, the generated custom properties are the mechanism that keeps a
 * measurement and the pixels on screen from drifting: the stylesheet reads the
 * numbers out of metrics.ts and holds no second copy of any of them.
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { System1Chrome } from './chrome.js'
import { System1MenuRenderer } from './menu.js'
import { system1Regions } from './shell.js'
import { SYSTEM1, SYSTEM1_METRICS, SYSTEM1_PROVENANCE, type Bitmap } from './metrics.js'
import './skin.css'

/**
 * A measured 1-bit bitmap as a `box-shadow` list, one shadow per ink pixel.
 *
 * Applied to a 1x1 element, so pixel (0,0) is the element itself and the rest are
 * offsets. `currentColor` rather than a fixed ink value: on a 1-bit display the
 * highlighted state *is* inversion, so a glyph has to follow its text colour.
 */
export function pixelShadow(rows: Bitmap): string {
  const parts: string[] = []
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    if (row === undefined) continue
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') parts.push(`${x}px ${y}px 0 0 currentColor`)
    }
  }
  return parts.join(', ')
}

/**
 * A `clip-path` staircase for a rectangle whose corners are a measured arc.
 *
 * `insets[i]` is how far in the shape's edge sits on row `i`, counted from the top;
 * every corner is the same arc mirrored, which is what the figures show. Every
 * segment is axis-aligned on an integer pixel boundary, so there is no partial
 * coverage and therefore no antialiasing — the same requirement that made XP's
 * five-row caption corner a clip path rather than a `border-radius`, and a harder
 * requirement here because a 1-bit era has no grey to hide a soft edge in.
 */
export function cornerClip(insets: readonly number[]): string {
  const n = insets.length
  const a = (i: number): number => insets[i] ?? 0
  const top = (i: number): string => (i === 0 ? '0' : `${i}px`)
  const bottom = (i: number): string => (i === 0 ? '100%' : `calc(100% - ${i}px)`)
  const left = (v: number): string => (v === 0 ? '0' : `${v}px`)
  const right = (v: number): string => (v === 0 ? '100%' : `calc(100% - ${v}px)`)
  const p: string[] = []

  // Top-left arc, walking down from the top edge.
  p.push(`${left(a(0))} 0`)
  for (let i = 1; i < n; i++) p.push(`${left(a(i - 1))} ${top(i)}`, `${left(a(i))} ${top(i)}`)
  p.push(`${left(a(n - 1))} ${top(n)}`, `0 ${top(n)}`)
  // Left edge.
  p.push(`0 ${bottom(n)}`)
  // Bottom-left arc, closing back inward.
  p.push(`${left(a(n - 1))} ${bottom(n)}`)
  for (let i = n - 1; i >= 1; i--) p.push(`${left(a(i))} ${bottom(i)}`, `${left(a(i - 1))} ${bottom(i)}`)
  p.push(`${left(a(0))} 100%`)
  // Bottom edge, then the bottom-right arc.
  p.push(`${right(a(0))} 100%`)
  for (let i = 1; i < n; i++) p.push(`${right(a(i - 1))} ${bottom(i)}`, `${right(a(i))} ${bottom(i)}`)
  p.push(`${right(a(n - 1))} ${bottom(n)}`, `100% ${bottom(n)}`)
  // Right edge, then the top-right arc.
  p.push(`100% ${top(n)}`)
  p.push(`${right(a(n - 1))} ${top(n)}`)
  for (let i = n - 1; i >= 1; i--) p.push(`${right(a(i))} ${top(i)}`, `${right(a(i - 1))} ${top(i)}`)
  p.push(`${right(a(0))} 0`)

  return `polygon(${p.join(', ')})`
}

/**
 * The same arc one pixel further in, for a box that is itself 1px smaller on every
 * side. The difference between the two shapes is a 1px outline that follows the arc.
 *
 * `inner[i] = max(outer[i + 1] + 1, outer[i]) - 1`. The `max` is what keeps the
 * outline one pixel thick where the arc steps diagonally instead of opening a gap at
 * the corner, and the trailing `- 1` converts to the smaller box's coordinates.
 *
 * Checked against the measured button: an outer arc of 3,1,1 gives 2,1, and the
 * outline that leaves is 2px wide on its second row and 1px everywhere else — exactly
 * what the figure shows.
 */
export function insetArc(insets: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < insets.length; i++) {
    const v = Math.max((insets[i + 1] ?? 0) + 1, insets[i]!) - 1
    if (v <= 0) break
    out.push(v)
  }
  return out
}

/** Written onto the desktop element so the stylesheet reads the measurements. */
export function system1GeneratedProperties(): Record<string, string> {
  const { titleBar, menu, menuBar, button, glyphs } = SYSTEM1
  return {
    '--s1-ink': SYSTEM1.palette.ink,
    '--s1-paper': SYSTEM1.palette.paper,

    '--s1-title-h': `${titleBar.height}px`,
    '--s1-stripe-top': `${titleBar.stripeTop}px`,
    '--s1-stripe-inset': `${titleBar.stripeInset}px`,
    /** Six stripes at 1px on / 1px off occupy 2n − 1 rows. */
    '--s1-stripe-band': `${titleBar.stripeCount * 2 - 1}px`,
    '--s1-title-cell-top': `${titleBar.textCellTop}px`,
    '--s1-title-clear': `${titleBar.textClearance}px`,

    '--s1-close': `${SYSTEM1.closeBox.size}px`,
    '--s1-close-inset': `${SYSTEM1.closeBox.inset}px`,
    '--s1-size-box': `${SYSTEM1.sizeBox.size}px`,
    '--s1-size-icon-left': `${SYSTEM1.sizeBox.iconInset.left}px`,
    '--s1-size-icon-top': `${SYSTEM1.sizeBox.iconInset.top}px`,

    /**
     * The type block. `--s1-line` is ascent + descent, not the 16px cell: at 16px
     * ChiKareGo2's content box is exactly 15px and its baseline sits 12px down, so a
     * 15px line box has zero half-leading and lands the cap top on row 3 and the
     * baseline on row 12. A 16px line-height would half-lead by 0.5px and put every
     * glyph in the era off the pixel grid.
     */
    '--s1-fs': `${SYSTEM1.font.cell}px`,
    '--s1-line': `${SYSTEM1.font.ascent + SYSTEM1.font.descender}px`,
    '--s1-cap-top': `${menu.capTop}px`,

    /*
     * The menu bar. `--s1-menubar-stride` is negative on purpose: a title's box is
     * the string plus 10px either side and the stride is the string plus 15, so the
     * boxes overlap by 5px. Both numbers are measured and they do not reconcile —
     * see the note on `menuBar` in metrics.ts. Expressing the overlap as a negative
     * margin is what reproduces both exactly instead of splitting the difference.
     */
    '--s1-menubar-h': `${menuBar.height}px`,
    '--s1-menubar-rule': `${menuBar.rule}px`,
    '--s1-menubar-title-top': `${menuBar.titleTop}px`,
    '--s1-menubar-cell-top': `${menuBar.cellTop}px`,
    '--s1-menubar-title-h': `${menuBar.titleHeight}px`,
    '--s1-menubar-pad': `${menuBar.titlePad}px`,
    '--s1-menubar-stride': `${menuBar.titleGap - menuBar.titlePad * 2}px`,
    '--s1-menubar-inset': `${menuBar.firstTitleInset}px`,
    '--s1-menubar-apple-box': `${menuBar.appleAdvance + menuBar.titlePad * 2}px`,
    '--s1-screen-border': `${SYSTEM1.screen.border}px`,
    '--s1-menubar-apple-top': `${menuBar.appleTop}px`,

    '--s1-menu-item-h': `${menu.itemHeight}px`,
    '--s1-menu-sep-rule': `${menu.separatorRule}px`,
    /** Interior offsets: the mark column, the label origin, the accelerator block. */
    '--s1-menu-mark': `${menu.markInset - 1}px`,
    '--s1-menu-label': `${menu.labelInset - 1}px`,
    '--s1-menu-accel': `${menu.accelInset - 1}px`,
    '--s1-menu-submenu': `${menu.submenuInset - 1}px`,
    '--s1-menu-key-gap': `${menu.accelLetterOffset - glyphs.command[0]!.length}px`,

    '--s1-btn-w': `${button.width}px`,
    '--s1-btn-h': `${button.height}px`,
    '--s1-btn-ring': `${button.ringWidth}px`,
    '--s1-btn-ring-gap': `${button.ringGap}px`,
    '--s1-btn-pad': `${button.textPadding}px`,
    '--s1-check': `${SYSTEM1.checkSize}px`,
    '--s1-textbox-h': `${SYSTEM1.textBox.height}px`,

    /** The knockout cell, in logical pixels. Doubling it gives the tile size. */
    '--s1-stipple': `${SYSTEM1.disabledText.cell * 2}px`,

    /**
     * The three clipped silhouettes.
     *
     * `--s1-gen-btn-clip` is the measured 3,1,1 arc; `--s1-gen-btn-inner` is it one
     * pixel in, which is what leaves the 1px outline. The default ring's gap layer
     * reuses `--s1-gen-btn-clip` unchanged on a box inset 3px inside the ring: a box
     * one pixel larger than the button carries the same arc pattern, which is what
     * the figure shows — the white gap measured 1px on the straight edges and the
     * arc's own 3,1,1 profile around the corners.
     */
    '--s1-gen-screen-clip': cornerClip([...SYSTEM1.screen.cornerInsets].filter((v) => v > 0)),
    '--s1-gen-btn-clip': cornerClip(button.cornerInsets),
    '--s1-gen-btn-inner': cornerClip(insetArc(button.cornerInsets)),
    '--s1-gen-ring-clip': cornerClip(
      [...button.ringCornerInsets].filter((v) => v > 0),
    ),

    '--s1-gen-check': pixelShadow(glyphs.checkmark),
    '--s1-gen-submenu': pixelShadow(glyphs.submenuArrow),
    '--s1-gen-command': pixelShadow(glyphs.command),
    '--s1-gen-grow': pixelShadow(glyphs.growIcon),
    '--s1-gen-checkbox': pixelShadow(glyphs.checkboxX),
    '--s1-gen-apple': pixelShadow(glyphs.apple),
  }
}

/**
 * System 1's chords.
 *
 * The 1984 Macintosh keyboard has **no Control, Option, Escape, arrow or function
 * keys** — every one of those arrives on a later keyboard. That single fact settles
 * most of this table:
 *
 * - `Meta+W` is Close and **`Meta+O` is Open**, the era's own File-menu chords. Open
 *   rather than New because ⌘O is the chord that produced a window in 1984 — you
 *   opened a disk or a folder — while ⌘N was New Folder, which makes no window and
 *   which Chronos has nothing to make. Binding `shell.newWindow` to ⌘N would have put
 *   the era's folder chord on a window command and made the menu bar say so.
 * - `Meta+.` is the era's cancel. There was no Escape key to press.
 * - **`Escape` is bound anyway**, as the accessibility escape hatch. `CLAUDE.md`
 *   requires that an era's behaviour may never be the thing that blocks one, and a
 *   modal or an open menu you cannot dismiss with the key everyone now reaches for is
 *   exactly that. Recorded as a deliberate addition rather than left implicit.
 * - **Window cycling is on `Ctrl+Tab`**, the knowing anachronism ARCHITECTURE.md §12
 *   conflict 1 settles. Control is the right key to spend it on precisely because the
 *   era's keyboard has none, so the chord cannot collide with anything System 1 bound.
 * - Move, Size, minimize and maximize get **no chord**. There are no function keys to
 *   put them on, and the first two are reachable from the chrome menu while the last
 *   two do not exist in this era at all.
 */
export const SYSTEM1_KEYMAP: readonly Binding[] = [
  { chord: 'Meta+W', command: 'window.close' },
  { chord: 'Meta+O', command: 'shell.newWindow' },
  { chord: 'Meta+.', command: 'shell.closeTransient' },
  { chord: 'Escape', command: 'shell.closeTransient' },
  { chord: 'Ctrl+Tab', command: 'window.cycleNext' },
  { chord: 'Ctrl+Shift+Tab', command: 'window.cyclePrev' },
]

// Parsed at load and checked against the key names a real KeyboardEvent can produce.
// A misspelled chord fails silently otherwise, and a dead keyboard path is a fidelity
// bug — this is how Alt+Space was caught in phase 2.
const unreachable = new Keymap(SYSTEM1_KEYMAP).unknownKeys()
if (unreachable.length > 0) {
  throw new Error(`system1 keymap has unreachable chords: ${unreachable.join(', ')}`)
}

export const system1Skin = {
  id: 'system1',
  chrome: new System1Chrome(),
  menu: new System1MenuRenderer(),
  metrics: SYSTEM1_METRICS,
  provenance: SYSTEM1_PROVENANCE,
  keymap: SYSTEM1_KEYMAP,
  /**
   * One region: the menu bar. No Dock and no window list, because there is no
   * multitasking to list — the era's answer to "where are my other windows" is that
   * you click one, and §12's neutral cycling chord is the accessibility path.
   */
  regions: system1Regions(),
  generatedProperties: system1GeneratedProperties,
  /**
   * 512x342, integer-scaled. Not a stylistic choice: the desktop is a 1px 50%
   * checkerboard and the disabled-text knockout is another, and at a fractional scale
   * either averages into exactly the flat grey it exists to disprove.
   */
  viewport: { mode: 'fixed' as const, logical: { w: 512, h: 342 } },
} as const
