/**
 * Windows 3.1 VGA — measured chrome metrics.
 *
 * Source: three PCjs Windows 3.10 captures in `docs/sources/`, each a 1280×960
 * canvas dump of a 640×480 VGA screen. Every value below is in logical VGA pixels,
 * measured after verifying the captures are lossless 2× nearest scales — fewer than
 * 20 colours, every 2×2 block uniform, no blend values anywhere.
 * Reproduce with `tools/captures/measure-win31.py docs/sources`.
 *
 * Unlike Windows XP, 3.1 published no specification: its metrics were runtime values
 * derived from the display driver's bitmaps and were never written down as a table.
 * So there is no documented tier here — the top level of confidence is `measured`,
 * and pixel measurement from a clean capture is the best provenance available.
 *
 * Four things here contradict what a Windows 95-derived recreation produces, and all
 * four are the palette or the era being narrower than 95's rather than an error:
 *
 * 1. The palette is 6-bit VGA DAC values. `#C0C4C8`, not `#C0C0C0`. `#0000A8`, not
 *    `#000080`. The button face carries a real blue tint — channels 48/49/50, not
 *    48/48/48 — and so does the shadow at 33/34/35. These are literals, not values
 *    to be "corrected" to neutral grey.
 * 2. The inactive caption is white with black text, not grey. Windows 95 changed it.
 * 3. The menu bar is white, not grey. Same story.
 * 4. Disabled text is a 50% checkerboard knocked out of the black glyph — the same
 *    mechanism as System 1's `notPatBic`, and not the grey-fill-plus-white-shadow
 *    that 95 introduced. Proven rather than asserted: the Run dialog's disabled OK
 *    label is 37 ink pixels with 100% of them on one `(x + y)` parity, while the
 *    Cancel label beside it is 140 pixels split 71/69.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'

const CAPTURE =
  'PCjs Windows 3.10, VGA 640x480, canvas buffer at 2x via toDataURL. ' +
  'docs/sources/win31-1280x960.png. See docs/sources/win31-metrics.md.'

const SYSMENU =
  'PCjs Windows 3.10 with the system menu open. docs/sources/win31-sysmenu.png. ' +
  'Reproduce with tools/captures/measure-win31.py.'

const DIALOG =
  'PCjs Windows 3.10, Program Manager File > Run. docs/sources/win31-dialog.png. ' +
  'Reproduce with tools/captures/measure-win31.py.'

export const WIN31_METRICS: ChromeMetrics = {
  /** Confirmed three times: top-level active, MDI child active, and inactive. */
  titleBarHeight: 18,
  titleBarHeightInactive: 18,
  /**
   * The sizing frame is 4px on every side: 1px `#000000`, 2px `#C0C4C8`, 1px
   * `#000000`. Measured on three windows, and again here where two windows nest —
   * the left edge reads black, grey, grey, black, black, grey, grey, black, which is
   * two 4px frames adjacent rather than one 8px frame.
   */
  border: insets(4, 4, 4, 4),
  /** Square. 3.1 has no corner treatment of any kind. */
  cornerTop: { kind: 'radius', px: 0 },
  resizeGrab: 4,
  /** Windows have no drop shadow in 3.1. Menus do; see WIN31.menu.shadow. */
  shadowInsets: insets(0, 0, 0, 0),
  cascadeStep: 22,
  dragGrabMargin: 48,
  maximizeSemantics: 'fill',
  /** 3.1 minimizes to a desktop icon, not to a taskbar — there is no taskbar. */
  minimizeStyle: 'shrink',
}

export const WIN31_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: {
    level: 'measured',
    source: CAPTURE,
    note: 'Three independent captions in the capture: rows 10..27, 52..69, and the '
      + 'inactive one. All 18px.',
  },
  titleBarHeightInactive: {
    level: 'measured',
    source: CAPTURE,
    note: 'Identical to the active height. 3.1 changes the caption colour when '
      + 'inactive, not its size.',
  },
  border: {
    level: 'measured',
    source: CAPTURE,
    note: '1px black / 2px #C0C4C8 / 1px black, confirmed on three windows.',
  },
  cornerTop: {
    level: 'measured',
    source: CAPTURE,
    note: 'Square. Rounded window corners arrive with XP; 3.1 frames are rectangles.',
  },
  resizeGrab: {
    level: 'derived',
    source: 'Set to the 4px frame width so the grab region is exactly the visible '
      + 'sizing border. 3.1 sized from the frame itself, which is what the frame is '
      + 'for; a wider slop would be a modern affordance.',
  },
  shadowInsets: {
    level: 'measured',
    source: CAPTURE,
    note: 'Zero, and this is a positive finding rather than a missing value: the '
      + 'capture shows the desktop pattern flush against the frame on all four '
      + 'sides. Menus do carry a 1px shadow and it is recorded separately.',
  },
  cascadeStep: {
    level: 'unverified',
    source: 'Not measurable from a static capture.',
    note: 'A single screenshot cannot show a cascade. 22px matches the value used '
      + 'for XP for want of anything better; the real 3.1 offset came from the '
      + 'display driver and is unknown.',
  },
  dragGrabMargin: {
    level: 'unverified',
    source: 'Not measurable from a static capture.',
    note: 'How much of a window 3.1 kept on screen while dragging cannot be seen '
      + 'in a still. 48px is a usability floor, not a measurement.',
  },
  maximizeSemantics: {
    level: 'measured',
    source: CAPTURE,
    note: 'The capture includes a maximized MDI child filling its parent exactly, '
      + 'so fill rather than zoom.',
  },
  minimizeStyle: {
    level: 'measured',
    source: CAPTURE,
    note: '3.1 minimizes to an icon on the desktop; there is no taskbar to shrink '
      + 'toward. The shell layout declares no taskbar region for this era.',
  },
}

/**
 * Colours, control geometry and text rendering beyond what the WM needs.
 *
 * The palette entries are 6-bit VGA DAC values written as 8-bit hex. Do not round
 * them to the familiar Windows constants — the tint is measured and visible.
 */
export const WIN31 = {
  palette: {
    /** Client and window backgrounds, the menu bar, and the inactive caption. */
    window: '#FCFCFC',
    /** Button face, frame fill, scroll bar trough. Channels 48/49/50 — blue-tinted. */
    face: '#C0C4C8',
    /** Frame lines and all text. */
    ink: '#000000',
    /** Bevel shadow. Channels 33/34/35 — blue-tinted, like the face. */
    shadow: '#84888C',
    /** Active caption. Flat: caption gradients arrive with Windows 95. */
    captionActive: '#0000A8',
    /** Inactive caption. White with black text, which 95 changed to grey. */
    captionInactive: '#FCFCFC',
    captionTextActive: '#FCFCFC',
    captionTextInactive: '#000000',
  },

  /**
   * The three-colour bevel.
   *
   * `CLAUDE.md` records that 3.1 has no four-colour 3D bevel — `COLOR_3DDKSHADOW`
   * and `COLOR_3DLIGHT` are Windows 95 additions — and that is confirmed here. What
   * the capture corrects is the width: the highlight and shadow are **2px, not 1px**.
   * The outline's corners are notched, so the black rectangle is 1px short at each
   * end of its top and bottom runs.
   */
  bevel: { outline: 1, highlight: 2, shadow: 2 },

  /** 70×23, measured on two buttons in the same dialog. */
  button: { width: 70, height: 23, gap: 4 },

  /** A plain 1px black rectangle with a white fill. No bevel at all in 3.1. */
  textBox: { border: 1, height: 20 },

  /** 13×13, 1px black frame, white fill. */
  checkSize: 13,

  menu: {
    /** 1px `#000000` on all four sides. */
    border: 1,
    /**
     * A 1px `#C0C4C8` drop shadow on the right and bottom only, offset one pixel
     * past the black frame — the same asymmetric-shadow idea as System 1, in grey
     * rather than black.
     */
    shadow: 1,
    /** Confirmed by a text-block pitch of exactly 18 across four adjacent items. */
    itemHeight: 18,
    /** Label ink is 12px tall inside an 18px item: 3px above, 3px below. */
    itemTextHeight: 12,
    /**
     * A separator is 7px tall with the 1px rule as its fourth row, so 3px of
     * padding either side. The rule spans the popup's **full outer width**,
     * replacing the frame pixel at each end rather than stopping inside it.
     */
    separatorHeight: 7,
    separatorRuleOffset: 3,
    /** Interior left edge to the start of label ink. */
    labelGutter: 16,
    /** Accelerator column to the interior right edge. */
    accelGutter: 15,
    /** The highlight spans the full interior width. */
    highlight: '#0000A8',
    highlightText: '#FCFCFC',
  },

  /**
   * A modal dialog frame, which is not the sizing frame a window gets.
   *
   * Measured asymmetric, and left asymmetric: 1px black plus 4px navy plus 1px white
   * on the sides, one row less navy on top, and no white line along the bottom. The
   * white line is a highlight, so having it on three sides and not the fourth is
   * consistent — but this is a single capture, and a 1px difference in a frame is
   * exactly what an underlying window could fake, so the asymmetry is flagged rather
   * than smoothed.
   */
  dialog: {
    outline: 1,
    borderSide: 4,
    borderTop: 3,
    highlight: 1,
    captionHeight: 18,
  },

  /**
   * Disabled text is drawn by knocking a 50% checkerboard out of the black glyph.
   *
   * Not a grey fill, and not a grey fill with a white shadow — that is the Windows 95
   * treatment and it is what nearly every recreation uses. The same mechanism applies
   * to a disabled menu item and a disabled button label; both were measured, and the
   * parity test is in `tools/captures/measure-win31.py`.
   *
   * A CSS implementation cannot knock a pattern out of live text, so this ships as a
   * `repeating-conic-gradient` mask at exactly 1 logical pixel — which is why the
   * era's integer display scale matters. At a non-integer scale the checkerboard
   * would alias into grey, which is the very thing being avoided.
   */
  disabledText: { mode: 'checkerboard', cell: 1 },

  /**
   * The System font. **One face for the entire era.**
   *
   * Captions, the menu bar, menu items, dialog labels and button labels are all the
   * same bold proportional bitmap face, at one size. This is Windows 3.1's `System`
   * font (`SYSTEM.FON`) — not MS Sans Serif, which 3.1 shipped as a separate dialog
   * face and which is what W95FA recreates.
   *
   * The measurements below are the substitution target, in the same spirit as the
   * Wine-derived Tahoma target used for XP. A candidate face must reproduce them at
   * the era's integer scale before any chrome is built on it.
   */
  font: {
    /** Cap height, from 'C' and 'M'. */
    capHeight: 9,
    /** Ascender to descender, from "Program Manager"'s 'g'. */
    inkHeight: 13,
    /** Stem width. The face is bold; 1px stems are the wrong weight entirely. */
    stem: 2,
    /**
     * Two known strings, as ink widths per glyph and the delta between successive
     * ink starts. Deltas rather than advances because ink start is what a bitmap
     * capture actually shows; a substitute matching both strings is matching the
     * advances and the side bearings together.
     */
    target: {
      Minimize: { inkWidths: [10, 2, 6, 2, 10, 2, 6, 6], startDeltas: [12, 4, 8, 4, 12, 4, 8], total: 58 },
      Cancel: { inkWidths: [7, 6, 6, 6, 6, 2], startDeltas: [8, 7, 7, 7, 7], total: 38 },
    },
  },
} as const

export const WIN31_PROVENANCE_EXTRA = {
  palette: {
    level: 'measured',
    source: CAPTURE,
    note: '14 unique colours in the capture, zero blend values. These are 6-bit DAC '
      + 'values, so they are not the Windows colour constants and must not be '
      + 'rounded to them.',
  },
  bevel: {
    level: 'measured',
    source: DIALOG,
    note: 'Measured on both buttons in the Run dialog. Corrects the 1px highlight '
      + 'and shadow recorded in ARCHITECTURE.md §7 to 2px.',
  },
  button: { level: 'measured', source: DIALOG },
  textBox: { level: 'measured', source: DIALOG },
  checkSize: { level: 'measured', source: DIALOG },
  menu: { level: 'measured', source: SYSMENU },
  dialog: {
    level: 'measured',
    source: DIALOG,
    note: 'The 3px-versus-4px asymmetry between the top and the sides is from a '
      + 'single capture. A second dialog capture would confirm or refute it.',
  },
  disabledText: {
    level: 'measured',
    source: DIALOG,
    note: 'Proven by parity analysis rather than by eye: the disabled OK label is '
      + '37 ink pixels, all on one (x + y) parity; the Cancel label beside it is 140 '
      + 'split 71/69.',
  },
  font: {
    level: 'measured',
    source: `${SYSMENU} and ${DIALOG}`,
    note: 'A metric target, not a resolved substitution. No face is named yet, so '
      + 'no chrome may be built on this — see docs/fonts/README.md.',
  },
} as const satisfies Record<keyof typeof WIN31, { level: string; source: string; note?: string }>
