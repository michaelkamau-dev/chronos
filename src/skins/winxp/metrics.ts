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
 * XP.css was the earlier source for the frame and caption. It is wrong in five
 * places and this file does not follow it: the caption is 30px not 28, the frame is
 * 4px not 3 (XP.css missed the outermost step), the corner is a 5-row stepped arc
 * not an 8px radius, the command button corner is a 1px indent not a 3px radius,
 * and the caption button gutter is 2px not 5. Each is noted on the value.
 *
 * Two of its values survive contact with the figures and are marked as confirmed
 * rather than replaced: the 21x21 caption button and its 2px inter-button gap.
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

const BUTTON_FIGURE =
  'Windows XP Visual Guidelines, figures "Title Bar Buttons" and "Example of the ' +
  'states for Title Bar buttons" (Microsoft, 2001-08-01), embedded bitmaps ' +
  'extracted at native size. See docs/sources/figures/README.md.'

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
  captionButton: {
    size: 21,
    gap: 2,
    /**
     * Gutter between the close button and the frame's inner edge. Six pixels
     * separate the button from the window's *outer* edge on a restored window —
     * 4px frame plus this 2px gutter — and a maximized window, which has no side
     * frame, shows exactly 2px. One value is right for both because the frame is
     * drawn outside the title bar's box.
     */
    rightInset: 2,
    /**
     * The buttons are NOT vertically centred: 6px above, 21px of button, 3px
     * below, in a 30px caption. Centring would put them at 4.5px and land the
     * whole button off the pixel grid.
     */
    topInset: 6,
    /** A 2px inset on the corner row and 1px on the next — an antialiased arc,
     *  unlike the window frame's hard steps. 3px is the integer radius that fits. */
    cornerRadius: 3,
    /** The 1px outline is opaque white when active and a pale blue when inactive —
     *  separate artwork, not one colour at two alphas. */
    outline: '#FFFFFF',
    outlineInactive: '#BCC4EE',
  },

  /**
   * Caption button faces, per interior row, top to bottom. 19 entries each — the
   * 21px button less its 1px outline on each side.
   *
   * These are Microsoft's own artwork, read off the specimen sheet the document
   * publishes for exactly this purpose, so hover and pressed stop being a
   * `filter: brightness()` guess. `impact` is the close button and `neutral` is
   * minimize/maximize: XP colours navigation semantically, red for high-impact and
   * blue for neutral, so the two categories are separate artwork rather than one
   * button with a hue rotation.
   *
   * The shape is the same as the caption's — a highlight at rows 1-3, a plateau, a
   * second lift through the lower middle, then a dark roll-off — which is why these
   * ship as per-row stops rather than as a four-stop approximation.
   */
  captionButtonFace: {
    impact: {
      rest: [
        '#E45D40', '#E87A5F', '#E97C63', '#E76F54', '#E46344', '#E46040',
        '#E45D3E', '#E35D3A', '#E45E3B', '#E55F3A', '#E6623B', '#E7653D',
        '#E7653D', '#E8643A', '#E66239', '#E65B33', '#E05329', '#D2441F',
        '#AD3011',
      ],
      hover: [
        '#FF6F5E', '#FF8B7C', '#FF8E80', '#FF8475', '#FF7767', '#FF7465',
        '#FF7463', '#FF7764', '#FF7C68', '#FF836D', '#FF8772', '#FF8E72',
        '#FF9075', '#FF8F74', '#FF8D6F', '#FF8568', '#FE775C', '#F2654B',
        '#D14932',
      ],
      active: [
        '#762511', '#9D3116', '#B23719', '#B8391A', '#BA391A', '#BB3A1B',
        '#BD3B1B', '#BE3C1C', '#C03E1D', '#C2401D', '#C3411E', '#C5431F',
        '#C64420', '#C6451F', '#C7461F', '#C5431F', '#C5431E', '#C4421E',
        '#C13F1D',
      ],
      disabled: [
        '#7578BD', '#767DC5', '#777EC4', '#767CC2', '#7579C0', '#7578BD',
        '#7677BC', '#7577BC', '#7578BB', '#7578BD', '#7678BD', '#7679BE',
        '#7679BC', '#7679BC', '#7678BB', '#7577BA', '#7476B9', '#7272B7',
        '#686FB3',
      ],
    },
    neutral: {
      rest: [
        '#3D72F4', '#608CF6', '#638DF8', '#5382F6', '#4777F6', '#4072F5',
        '#3D72F6', '#3A70F5', '#3A73F6', '#3B76F5', '#3C7AF6', '#3D7EF7',
        '#3C7FF6', '#3A7DF6', '#387BF6', '#3275F7', '#2B6CF2', '#1E5DE3',
        '#0F44BE',
      ],
      hover: [
        '#4684FF', '#699AFF', '#6D9DFF', '#6095FE', '#528BFF', '#4D8AFF',
        '#4889FF', '#478AFF', '#4890FF', '#4B94FF', '#4D98FE', '#4EA0FF',
        '#4FA4FF', '#4CA4FF', '#46A3FE', '#409DFF', '#3590FC', '#2979EE',
        '#1758CA',
      ],
      active: [
        '#002F6D', '#003E91', '#0045A4', '#0048AA', '#0048AC', '#0049AD',
        '#004AB0', '#004CB1', '#004EB3', '#0050B5', '#0052B6', '#0054BA',
        '#0056BB', '#0058BC', '#0057BC', '#0056BB', '#0055BA', '#0054B7',
        '#0050B5',
      ],
      disabled: [
        '#2161E7', '#3369E6', '#3369E6', '#2D62E6', '#255DE6', '#215AE7',
        '#2059E8', '#1E58E8', '#205AE9', '#205DEA', '#205FEC', '#2061ED',
        '#2063EF', '#2065F2', '#1E65F3', '#1A64F4', '#1661F3', '#0F5AED',
        '#094ED9',
      ],
    },
  },

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
    source: BUTTON_FIGURE,
    note: 'Measured from the "Title Bar Buttons" figure, which shows three real '
      + 'captions — inactive, active, maximized — with nothing drawn over the '
      + 'buttons, and cross-checked against the 21 specimens in "Example of the '
      + 'states for Title Bar buttons". Calibrated by the caption itself: the '
      + 'active window measures 30px from outer edge to client area and its right '
      + 'frame measures 4px, both matching the values already measured twice from '
      + 'the "actual size" figure, so this bitmap is 1:1 too. 6 + 21 + 3 = 30 '
      + 'exactly. XP.css had the size and the gap right and the right inset wrong.',
  },
  captionButtonFace: {
    level: 'measured',
    source: BUTTON_FIGURE,
    note: 'Median of the interior columns per row, from the specimen sheet the '
      + 'document publishes to show all four states. rest/hover/active are opaque '
      + 'artwork and the values stand. `disabled` is CONTESTED for the same reason '
      + 'the caption gradient is: the disabled specimens are drawn partly '
      + 'transparent over the figure\'s own blue panel, so the panel is mixed into '
      + 'every sample. Solving for a single alpha fails — it lands at 0.23 for the '
      + 'red and above 1.0 for the blue, which no compositing operation produces — '
      + 'so the disabled row is separate artwork over an unknown background rather '
      + 'than the rest artwork at reduced opacity. What the values do establish is '
      + 'the structure: disabled strips the close button of its red entirely and '
      + 'lands it near the caption blue, while the neutral buttons stay blue and '
      + 'darken. luna.msstyles resolves the exact values.',
  },
  fontPx: {
    level: 'derived',
    source: 'Point sizes from the Visual Guidelines, converted at 96 DPI and rounded '
      + 'to the integer pixel. See docs/fonts/README.md.',
  },
} as const satisfies Record<keyof typeof XP_LUNA, { level: string; source: string; note?: string }>
