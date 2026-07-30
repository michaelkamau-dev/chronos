/**
 * Windows XP Luna — measured chrome metrics.
 *
 * Two sources, and where they disagree the primary source wins:
 *
 * - **`docs/sources/winxp-luna-metrics.md`** — the *Windows XP Visual Guidelines*
 *   (Microsoft, August 2001). Prose with explicit pixel counts and RGB values.
 *   Re-verified against the Controls chapter served from the mirror's backing repo.
 * - **`docs/sources/figures/`** — the figure captioned "Standard window components
 *   in actual size", extracted at native size and measured. Microsoft states the
 *   figure is 1:1, so its pixels are Microsoft's pixels.
 *
 * XP.css was the earlier source for the frame and caption. It is wrong in four
 * places and this file does not follow it: the caption is 30px not 28, the frame is
 * 4px not 3 (XP.css missed the outermost step), the corner is a 5-row stepped arc
 * not an 8px radius, and the command button corner is a 1px indent not a 3px
 * radius. Each is noted on the value.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'

const FIGURE =
  'Windows XP Visual Guidelines, figure "Standard window components in actual ' +
  'size" (Microsoft, 2001-08-01), embedded bitmap extracted at native size. ' +
  'See docs/sources/figures/README.md.'

const GUIDELINES =
  'Windows XP Visual Guidelines (Microsoft, 2001-08-01), stated in prose. ' +
  'See docs/sources/winxp-luna-metrics.md.'

const XPCSS_MEASURED =
  'Measured from XP.css, which is a recreation rather than a primary source. ' +
  'Retained only where the 1:1 figure does not cover the value.'

export const XP_METRICS: ChromeMetrics = {
  /** Outer top edge to the top of the client area. Measured twice, two bitmaps. */
  titleBarHeight: 30,
  titleBarHeightInactive: 30,
  /** Four discrete 1px steps per side. The top edge is inside the caption. */
  border: insets(0, 4, 4, 4),
  /**
   * Per-row x-insets of the top corner arc. Not a radius: Microsoft's figure
   * shows five rows stepping 5,3,2,1,1 then flush. `border-radius` cannot
   * reproduce a hand-drawn corner bitmap, so the skin clips to these steps.
   */
  cornerTop: { kind: 'steps', insets: [5, 3, 2, 1, 1, 0] },
  resizeGrab: 4,
  shadowInsets: insets(0, 0, 0, 0),
  cascadeStep: 22,
  dragGrabMargin: 48,
  maximizeSemantics: 'fill',
  minimizeStyle: 'shrink',
}

export const XP_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: {
    level: 'measured',
    source: FIGURE,
    note: 'XP.css says 28px. The figure says 30px, confirmed independently by the '
      + 'title-bar-states figure in the same document.',
  },
  titleBarHeightInactive: {
    level: 'measured',
    source: FIGURE,
    note: 'The inactive caption in the states figure is also 30px — height does not '
      + 'change with focus, only colour.',
  },
  border: {
    level: 'measured',
    source: FIGURE,
    note: 'XP.css says 3px. The figure shows four 1px steps; XP.css\'s three colours '
      + 'are steps 2-4 and it missed the outermost, #0019CE.',
  },
  cornerTop: {
    level: 'measured',
    source: FIGURE,
    note: 'XP.css uses an 8px border-radius. The measured arc completes in five rows '
      + 'with insets 5,3,2,1,1,0.',
  },
  resizeGrab: {
    level: 'derived',
    source: 'Chosen to match the 4px sizing frame so the whole border is grabbable.',
  },
  shadowInsets: {
    level: 'unverified',
    source: FIGURE,
    note: 'Luna windows have no drop shadow in the figure, and the Visual Guidelines '
      + 'state none. Zero is a positive finding rather than a missing value, but the '
      + 'drop-shadow-on-menus case is separate and still unmeasured.',
  },
  cascadeStep: {
    level: 'unverified',
    source: GUIDELINES,
    note: 'Not stated anywhere in the Visual Guidelines and not derivable from a '
      + 'single-window figure. 22px is carried over from the harness. Needs a '
      + 'multi-window capture or the shell source to settle.',
  },
  dragGrabMargin: {
    level: 'unverified',
    source: GUIDELINES,
    note: 'Windows enforces a minimum on-screen caption area but the value is not in '
      + 'the Visual Guidelines. 48px is a usable default, not a measurement.',
  },
  maximizeSemantics: {
    level: 'documented',
    source: GUIDELINES,
    note: 'Windows maximize fills the work area, distinct from classic Mac zoom.',
  },
  minimizeStyle: {
    level: 'documented',
    source: GUIDELINES,
    note: 'XP minimizes toward the taskbar button.',
  },
}

/**
 * Colours and control geometry beyond what the window manager needs.
 *
 * Separate from ChromeMetrics because the WM has no use for a disabled-text
 * colour — it only wants numbers that affect layout and hit-testing. These feed
 * the stylesheet and the widget templates.
 */
export const XP_LUNA = {
  /**
   * Frame steps, **outermost first**, one entry per 1px step.
   *
   * The left and right sides share these four. The bottom differs and is
   * measured separately: at the window's last row the colour is #001EA0, so
   * reading outward-in from the bottom edge gives #001EA0, #001EA0, #0048F2,
   * #0048F2.
   */
  frameSide: ['#0019CE', '#0831D9', '#166AEE', '#0955DE'] as const,
  frameBottom: ['#001EA0', '#001EA0', '#0048F2', '#0048F2'] as const,

  /**
   * Active caption gradient, per row, top to bottom. 30 entries.
   *
   * Measured as the median of caption-blue pixels per row so the window icon and
   * title text cannot contaminate a sample. The figure is a JPEG, so these values
   * carry lossy error and are NOT a resolution of the contested gradient — what
   * they establish is the structure: a dark top edge, a highlight at rows 1-3, a
   * plateau, a second brightening around rows 22-25, then two dark closing rows.
   * `luna.msstyles` remains the way to exact colour.
   */
  captionActive: [
    '#0058EA', '#3E95FF', '#2B90FF', '#0372FF', '#0465F0', '#015CE9',
    '#0158E6', '#0056E4', '#0054E3', '#0155E4', '#0055E6', '#0055E4',
    '#0055E4', '#0055E4', '#0055E4', '#0155EB', '#0056EB', '#0058EE',
    '#005BF2', '#005AF6', '#0061FA', '#0064F8', '#026AFD', '#026AFE',
    '#026AFF', '#026AFD', '#0165FB', '#0060FA', '#004CE3', '#0143CF',
  ] as const,

  /** Inactive caption gradient. Previously undocumented anywhere. */
  captionInactive: [
    '#688CE0', '#98B2E8', '#9DB9EB', '#8AACE7', '#83A6E5', '#7EA0E3',
    '#7C9DE2', '#7A9BE2', '#7899E0', '#7997DF', '#7B95DF', '#7A98E0',
    '#7A96DF', '#7A96DF', '#7A96DF', '#7B97E0', '#7C98E1', '#7D9AE3',
    '#7E9CE5', '#7F9DE6', '#80A0E8', '#81A3E9', '#82A6EA', '#83A9EA',
    '#83A9EA', '#82A7E9', '#81A5E8', '#7FA0E5', '#7B96DF', '#7993DE',
  ] as const,

  /** Command buttons: 75x23 with a 1px corner indent, not a radius. */
  button: { width: 75, height: 23, cornerIndent: 1, border: '#003C74' },

  /** Radio buttons and check boxes ship at three sizes; XP only uses 16x16. */
  checkSize: 16,

  /** Two disabled greys, separately specified. Never unify them. */
  disabledControlText: '#A1A192',
  disabledMenuText: '#808080',

  textBox: { border: '#7F9DB9', disabledFill: '#EBEBE4', readOnlyFill: '#EBEBE4' },
  comboBox: { fill: '#FFFFFF', disabledFill: '#C9C7BA', border: '#7F9DB9', disabledBorder: '#F5F4EA' },
  groupBox: { title: '#0046D5' },
  spin: { outline: '#828282', disabledOutline: '#A1A192', disabledFill: '#EBEBE4' },
  menu: {
    background: '#FFFFFF',
    text: '#000000',
    highlight: '#316AC5',
    highlightText: '#FFFFFF',
    border: '#808080',
    separator: '#808080',
    disabledText: '#808080',
  },
  statusBar: { separatorLeft: '#C7C5B2', separatorRight: '#FFFFFF', gripper: '#B8B4A3' },

  /**
   * Caption buttons are NOT a uniform set. XP's navigation-button colours are
   * semantic — red is high-impact, blue is neutral — so close is red by category
   * while minimize and maximize are blue. That is the documented design rationale,
   * not a stylistic choice.
   */
  captionButton: { size: 21, gap: 2, rightInset: 5 },

  /**
   * Point sizes resolved to the integer pixel Windows rasterised at 96 DPI.
   * 8pt is 10.667px and CSS `font-size: 8pt` would land every glyph edge on a
   * half-pixel. Only 9pt and 21pt divide evenly.
   */
  fontPx: { ui8: 11, ui9: 12, ui11: 15, caption: 13, palette: 11, header14: 19, header21: 28 },
} as const

export const XP_LUNA_PROVENANCE = {
  frameSide: { level: 'measured', source: FIGURE },
  frameBottom: { level: 'measured', source: FIGURE },
  captionActive: {
    level: 'measured',
    source: FIGURE,
    note: 'JPEG-derived. Structure is reliable; exact values are not. Contested '
      + 'against both XP.css and the published palette until luna.msstyles.',
  },
  captionInactive: {
    level: 'measured',
    source: FIGURE,
    note: 'Same JPEG caveat. Rows 4-28 are interpolated across the measured '
      + 'plateau; rows 0-3 and 29 are direct measurements.',
  },
  button: { level: 'documented', source: GUIDELINES },
  checkSize: { level: 'documented', source: GUIDELINES },
  disabledControlText: { level: 'documented', source: GUIDELINES },
  disabledMenuText: { level: 'documented', source: GUIDELINES },
  textBox: { level: 'documented', source: GUIDELINES },
  comboBox: { level: 'documented', source: GUIDELINES },
  groupBox: { level: 'documented', source: GUIDELINES },
  spin: { level: 'documented', source: GUIDELINES },
  menu: { level: 'documented', source: GUIDELINES },
  statusBar: { level: 'documented', source: GUIDELINES },
  captionButton: {
    level: 'measured',
    source: XPCSS_MEASURED,
    note: 'The 1:1 figure has the magnifier callout drawn over the caption buttons, '
      + 'so they cannot be measured from it. 21x21 with a 2px gap and 5px right '
      + 'inset comes from XP.css. The states figure would settle it but the buttons '
      + 'there sit against three different caption colours.',
  },
  fontPx: {
    level: 'derived',
    source: 'Point sizes from the Visual Guidelines, converted at 96 DPI and rounded '
      + 'to the integer pixel. See docs/fonts/README.md.',
  },
} as const satisfies Record<keyof typeof XP_LUNA, { level: string; source: string; note?: string }>
