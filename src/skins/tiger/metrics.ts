/**
 * Mac OS X Tiger (10.4) — measured chrome metrics.
 *
 * Source: the Tiger-edition *Apple Human Interface Guidelines* (2005-12-06),
 * `docs/sources/tiger-hig-2005-12-06.pdf`. Apple published **no** window, title bar,
 * scroll bar, Dock or menu specification in prose — only figures — so every number
 * here comes from measuring embedded bitmaps at their native pixel size. The top
 * level of confidence available is `measured`; nothing in this file is `documented`
 * except the font sizes and the control heights Apple did write down.
 *
 * Full derivation, the calibration argument, and the list of what is still unknown:
 * `docs/eras/tiger.md`. Reproduce with:
 *   python3 tools/pdf-extract/measure-tiger-titlebuttons.py docs/sources/tiger-hig-2005-12-06.pdf
 *   python3 tools/pdf-extract/measure-tiger-chrome.py       docs/sources/tiger-hig-2005-12-06.pdf
 *
 * **Two values here correct ARCHITECTURE.md §7**, and both had the same cause — §7's
 * numbers came from one figure read with a threshold-based edge finder that locked
 * onto the window's drop shadow rather than its frame:
 *
 * 1. The first traffic light is **9px** from the window's left edge, not 13px. Five
 *    figures agree once the edge is found by largest step instead of first step.
 * 2. A traffic light is **14px** including its 1px ring, not 12px. §7's 12px is the
 *    saturated core, found by a saturation test that cannot see the ring — or a grey
 *    light at all, which is why the disabled state was recorded as unmeasurable.
 *
 * **Three things clones get wrong**, two already flagged in §7 and confirmed here by
 * measurement rather than assertion:
 *
 * - Tiger's Dock is a **flat 2D shelf**. The 3D glass shelf is 10.5 Leopard.
 * - Tiger's menu bar has **no translucency**. Also 10.5. Proven here: two columns
 *   420px apart inside the bar give identical per-row values, and the desktop
 *   visible below it is a different gradient entirely.
 * - The famous traffic-light colours `#FF5F57` / `#FEBC2E` / `#28C840` are **modern
 *   macOS values from CSS clones**. Tiger's close button bodies around `#C1362F` and
 *   peaks at `#F07A71`.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'

const FIG_13_3 =
  'Apple Human Interface Guidelines (Tiger, 2005-12-06) Figure 13-3 "Title bar '
  + 'buttons for standard windows", p175 — fifteen separate embedded bitmaps, every '
  + 'one placed at px/pt = 1.000 (72 DPI, the resolution Mac OS X drew at). '
  + 'tools/pdf-extract/measure-tiger-titlebuttons.py'

const FIG_13_19 =
  'Ibid. Figure 13-19 "Main, key, and inactive windows", p191 — three windows in one '
  + 'bitmap. tools/pdf-extract/measure-tiger-chrome.py'

const FIG_13_22 =
  'Ibid. Figure 13-22 "The elements of a scroll bar", p194 — a whole standard window. '
  + 'tools/pdf-extract/measure-tiger-chrome.py'

const FIG_12_11 =
  'Ibid. Figure 12-11 "A hierarchical menu", p153 — an enabled, a dimmed and a '
  + 'highlighted item, two separators and a submenu in one bitmap. '
  + 'tools/pdf-extract/measure-tiger-chrome.py'

const FIG_12_12 =
  'Ibid. Figure 12-12 "The menu bar displayed when the Finder is active", p154. '
  + 'tools/pdf-extract/measure-tiger-chrome.py'

const FIG_10_1 =
  'Ibid. Figure 10-1 "The Dock", p125. tools/pdf-extract/measure-tiger-chrome.py'

const FIG_7_1 =
  'Ibid. Figure 7-1 "Keyboard focus for a text field", p99 — the one figure in the '
  + 'book that is a lossless PNG rather than a JPEG. '
  + 'tools/pdf-extract/measure-tiger-chrome.py'

const SIX_FIGURES =
  'Ibid., measured independently in Figures 13-2, 13-3 (fifteen bitmaps), 13-19 '
  + '(two windows), 13-22 and 12-12. Six separately cropped and separately '
  + 'compressed bitmaps agreeing on 22px + a 1px separator is what establishes them '
  + 'as 1:1; see docs/eras/tiger.md §1.'

export const TIGER_METRICS: ChromeMetrics = {
  /**
   * 22px, plus a 1px separator that the border's top accounts for — so the client
   * area begins 23px down. Corroborated by `NSStatusBar.system.thickness == 22`,
   * and Figure 12-12 puts the menu bar at exactly the same 22px.
   */
  titleBarHeight: 22,
  /** Tiger changes the title bar's gradient and its ink when inactive, not its size. */
  titleBarHeightInactive: 22,
  /**
   * 1px on the left, right and bottom; the top is the 1px separator below the title
   * bar. The frame is a hairline — Aqua carries the window's weight in its drop
   * shadow rather than in a sizing border, which is the opposite of Luna's 4px.
   */
  border: insets(1, 1, 1, 1),
  /**
   * A genuine radius, and that is a decision rather than a default. The measured arc
   * profile is 4,3,2,1,1,0 — structurally the same object as Luna's 5,3,2,1,1,0 — but
   * Tiger's is **antialiased** where Luna's is hard 1-bit steps, so a `clip-path`
   * polygon would throw away the partial coverage that is part of the artwork. A 6px
   * radius predicts 3.6, 2.0, 1.1, 0.6, 0.2, 0.0 against the measured profile; the
   * 1px excess at rows 1-2 is the antialiasing the measurement cannot exclude.
   */
  cornerTop: { kind: 'radius', px: 6 },
  /**
   * A 1px frame is not grabbable, so the grab region reaches outward into the
   * shadow. Aqua windows really did resize from a few pixels outside the hairline.
   */
  resizeGrab: 4,
  /**
   * The shadow is painted and must not be hit-tested. Measured at ~12px on the
   * sides; the bottom is deeper than that and the figure's crop ends before it does,
   * so this is the side measurement applied to all four edges.
   */
  shadowInsets: insets(6, 12, 12, 12),
  /** 20px right, 20px down — the one window-placement value Apple did document. */
  cascadeStep: 20,
  dragGrabMargin: 48,
  /**
   * `zoom`, not `fill`, and this is the era's semantics rather than a preference.
   * Apple: "the zoom button ... toggles between the user's preferred size and
   * position and the standard state" — a Mac zoom fits the content, it does not fill
   * the screen. The window manager implements both and the skin declares which.
   */
  maximizeSemantics: 'zoom',
  /** Tiger genies into the Dock. The Dock region supplies the target rect. */
  minimizeStyle: 'genie',
}

export const TIGER_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: {
    level: 'measured',
    source: SIX_FIGURES,
    note: '22px in every figure. Figure 13-3 alone reproduces it fifteen times, and '
      + 'the same 22px is the menu bar height in Figure 12-12, which is what the '
      + 'NSStatusBar.thickness datum describes.',
  },
  titleBarHeightInactive: {
    level: 'measured',
    source: FIG_13_19,
    note: 'Identical to the active height. The inactive window in Figure 13-19 has '
      + 'the same 22px bar with a nearly flat gradient and #4D5B5F ink instead of '
      + 'black.',
  },
  border: {
    level: 'measured',
    source: FIG_13_22,
    note: '1px hairline: left #A4B6BE, right #AEBAC0. The top inset is the 1px '
      + 'separator under the title bar (#8C8C8C), so the client area starts 23px '
      + 'from the outer top edge.',
  },
  cornerTop: {
    level: 'measured',
    source: FIG_13_3,
    note: 'Arc profile 4,3,2,1,1,0 measured on the cleanest crop. Shipped as a 6px '
      + 'radius because the arc is antialiased — see the comment on the value. The '
      + 'bottom corners are square (Figure 13-22).',
  },
  resizeGrab: {
    level: 'derived',
    source: 'Set to 4px so a 1px hairline frame stays grabbable, reaching outward '
      + 'into the painted shadow. Not measurable from a still: how far outside the '
      + 'frame Tiger accepted a resize drag is behaviour, not geometry.',
  },
  shadowInsets: {
    level: 'measured',
    source: FIG_13_22,
    note: 'The side ramp runs ~12px, #FBFBFB at the outside to #A4B6BE at the frame. '
      + 'The bottom ramp is deeper and the figure is cropped before it ends, so 12 '
      + 'is the side measurement applied to the sides and bottom; the top is 6 '
      + 'because an Aqua shadow is cast downward and barely reaches above the '
      + 'window. The top value is the weakest number in this table.',
  },
  cascadeStep: {
    level: 'documented',
    source: 'Ibid., the window-placement guidance: 20px right and 20px down for each '
      + 'successive new window.',
  },
  dragGrabMargin: {
    level: 'unverified',
    source: 'Not measurable from a static figure.',
    note: 'How much of a window Tiger kept on screen during a drag cannot be seen in '
      + 'a still. 48px is a usability floor, not a measurement. Apple does document '
      + 'the related rule — "prevent users from moving or resizing windows so that '
      + 'they are behind the Dock" (p56) — which the reserved work area implements, '
      + 'but it states no distance.',
  },
  maximizeSemantics: {
    level: 'documented',
    source: 'Ibid. p189, "Resizing and Zooming Windows": zoom toggles between the '
      + "user's size and a standard state that fits the content, rather than "
      + 'filling the screen. This is why the WM needs both semantics.',
  },
  minimizeStyle: {
    level: 'documented',
    source: 'Ibid. p189, "Minimizing and Expanding Windows": a minimized window '
      + 'shrinks into the Dock. The Dock region supplies the destination rect '
      + 'through the shell, so the window manager never learns why it is there.',
  },
}

/**
 * Colours, artwork and control geometry beyond what the window manager needs.
 *
 * Every gradient here is a measured per-row list rather than a CSS interpolation
 * between two endpoints, for the reason phase 3 recorded for Luna: an Aqua gradient
 * is not linear. The title bar has a bright first row and a plateau; the menu bar has
 * two highlights and a trough; the traffic lights brighten toward the bottom.
 */
export const TIGER = {
  /**
   * The active title bar, top frame line first and separator last — 23 values.
   *
   * Three of Figure 13-3's fifteen specimens, cropped and compressed separately,
   * give these to within one unit, and every row is **exactly neutral** (R = G = B).
   * That is what settles a question that would otherwise have had to ship
   * `contested`: Figures 13-2 and 13-19 read the same bar with a 4-to-9 unit cool
   * cast, which could have been Aqua Blue's real tint. A tinted source cannot
   * produce R = G = B on 23 rows in three independent crops, so the cast belongs to
   * those two busier bitmaps and the bar is neutral grey.
   */
  titleBar: {
    frameLine: '#C0C0C0',
    separator: '#8C8C8C',
    rows: [
      '#F9F9F9', '#EFEFEF', '#E8E8E8', '#E6E6E6', '#E6E6E6', '#E6E6E6', '#E4E4E4',
      '#E3E3E3', '#E2E2E2', '#E0E0E0', '#DFDFDF', '#DDDDDD', '#DBDBDB', '#D9D9D9',
      '#D7D7D7', '#D5D5D5', '#D3D3D3', '#D1D1D1', '#CFCFCF', '#CCCCCC', '#CACACA',
    ],
    ink: '#000000',
  },

  /**
   * The inactive title bar. Nearly flat rather than a ramp, and the ink greys.
   *
   * Carries the cool cast of Figure 13-19, which is the only figure that shows an
   * inactive window — so unlike the active bar there is no second reading to
   * cross-check it against, and the cast cannot be attributed either way here.
   */
  titleBarInactive: {
    frameLine: '#D0D2D3',
    separator: '#9A9FA1',
    rows: [
      '#FAFBFD', '#F0F4F7', '#EFF4F7', '#EFF4F8', '#EFF4F8', '#EFF4F8', '#EFF4F8',
      '#EFF4FA', '#EDF4FA', '#EDF2F5', '#EFF4F7', '#F1F6F9', '#F0F5F8', '#EDF2F5',
      '#ECF1F4', '#EEF3F6', '#F0F5F8', '#ECF1F4', '#EEF3F6', '#F0F5F8', '#EBF0F3',
    ],
    ink: '#4D5B5F',
  },

  /**
   * The traffic lights.
   *
   * `5 + 14 + 4 = 23` — the inset from the top frame line, the diameter, and the
   * clear to the separator, summing exactly to the title bar plus its separator.
   * The same kind of exact division that confirmed Luna's `6 + 21 + 3 = 30`.
   *
   * And as with Luna, **they are not vertically centred**: centring 14px in a 22px
   * bar gives 4 above and 4 below, and the measurement is 5 above and 3 below, in
   * all fifteen specimens.
   */
  lights: {
    diameter: 14,
    /** Centre to centre. Never varies across four figures. */
    pitch: 21,
    /** First light's outer edge, from the window's left frame line. */
    insetLeft: 9,
    /** From the window's top frame line. One pixel lower than centred. */
    insetTop: 5,
    /**
     * Per-row median across each light's width, 14 rows, top first. Measured from
     * the specimen where that button is the only one present, so no neighbour can
     * contaminate the sample.
     */
    rows: {
      close: [
        '#B9B9B9', '#848B8C', '#AE9B9C', '#B99797', '#A65450', '#B4352E', '#C1362F',
        '#D05449', '#E36A5F', '#F07A71', '#F39788', '#DD9C8D', '#C68F8B', '#C8C3C5',
      ],
      minimize: [
        '#B9B7B8', '#8F868B', '#B99E9D', '#B8B39A', '#C88249', '#D98520', '#EB9427',
        '#F3AE2E', '#F8BB3F', '#F6CB5A', '#FAD177', '#DBD686', '#CDCD7B', '#C6C3C3',
      ],
      zoom: [
        '#B7B7B7', '#89898C', '#9AA09D', '#A3B39F', '#729448', '#549B25', '#6BAC29',
        '#80BE2E', '#93D14B', '#A4DC69', '#B2E37C', '#BDDC8C', '#ABCD85', '#C4C8C6',
      ],
      /** Also the inactive-window artwork: an inactive window's lights are these. */
      disabled: [
        '#C9C9C9', '#ADADAD', '#C8C8C8', '#C5C5C5', '#C1C1C1', '#C8C8C8', '#CDCDCD',
        '#D6D6D6', '#DDDDDD', '#E0E0E0', '#E1E1E1', '#DADADA', '#D0D0D0', '#CECECE',
      ],
    },
    /**
     * The 1px ring, sampled at each light's middle row where it is at its darkest
     * and carries the button's own hue.
     */
    ring: {
      close: '#411316',
      minimize: '#5F2114',
      zoom: '#1C3317',
      disabled: '#818181',
    },
  },

  /** The menu bar. 22px including its own 1px bottom rule — the same as a title bar. */
  menuBar: {
    height: 22,
    rule: '#BDBDBD',
    /** The bar casts this onto the desktop below its rule. */
    shadow: '#9E9E9E',
    /** 21 rows above the rule. Two highlights and a trough, not a ramp. */
    rows: [
      '#FFFFFF', '#FEFEFE', '#FBFBFB', '#F8F8F8', '#F5F5F5', '#F4F4F4', '#F3F3F3',
      '#F2F2F2', '#F2F2F2', '#F2F2F2', '#F0F0F0', '#E9E9E9', '#EAEAEA', '#F0F1F1',
      '#F3F3F4', '#F4F5F5', '#FBFBFB', '#F9F9F9', '#FEFEFE', '#FFFFFF', '#FCFCFC',
    ],
    ink: '#000000',
    /** Horizontal padding inside a menu bar title, each side. */
    titlePadding: 9,
    /** Left inset of the first title, where the Apple menu sits. */
    firstTitleInset: 8,
  },

  menu: {
    border: '#949494',
    itemHeight: 19,
    separatorRule: '#CDCDCD',
    /** Total slot a separator occupies, rule included. */
    separatorHeight: 12,
    highlight: '#3262B4',
    highlightText: '#FFFFFF',
    ink: '#000000',
    /** Apple: an unavailable item is dimmed *and* is not highlighted on hover. */
    disabledInk: '#808080',
    /** Interior left edge to the start of label ink. */
    labelGutter: 23,
    /** Accelerator column to the interior right edge. */
    accelGutter: 12,
    radius: 5,
    /**
     * Aqua's pinstripe: two rows of each grey, a 4px period.
     *
     * Not a flat fill, and this is proven rather than eyeballed. The menu figure is
     * a JPEG but shows **exactly two** distinct greys alternating on a two-row
     * period for the menu's whole height — JPEG works in 8x8 blocks and would give
     * an 8px period and more than two values. Figure 7-1 is a **lossless PNG** and
     * its window body alternates on the same two-row period, which is what licenses
     * reading the construction out of the lossy figure.
     */
    pinstripe: { a: '#F3F3F3', b: '#EFEFEF', period: 4 },
  },

  /**
   * The Dock: a flat 2D shelf, per §7's correction, confirmed by Figure 10-1.
   *
   * `fill` and `height` are **unverified** and say so in the provenance below. The
   * figure crops the Dock onto the document's white page and Tiger's shelf is
   * translucent, so it composited against the paper — the median above and below the
   * icons is #FEFEFE, which is the page. Only the edging and the divider survive.
   */
  dock: {
    /** Documented 48px; measured 47px in the figure, which is what calibrates it. */
    iconSize: 48,
    /** Documented in §7. Not exercised by the chrome; recorded for phase 5. */
    magnifiedIconSize: 128,
    divider: '#DFDFDF',
    edge: '#DEDEDE',
    /** Derived: icon plus the padding the figure's icon-to-edge distance implies. */
    height: 68,
    /** Unverified — see the note in TIGER_PROVENANCE_EXTRA.dock. */
    fill: 'rgba(255, 255, 255, 0.62)',
    /** Gap between tiles. Derived from the figure's icon pitch. */
    gap: 6,
    /** The running-application indicator below a tile. */
    indicator: '#3D3D3D',
  },

  /**
   * The Aqua focus ring, outside inward. From Figure 7-1 — a **lossless PNG**, so
   * these are the only exact colours in the era.
   *
   * Apple, documented: "Focus is indicated with a ring in the appearance color
   * (Aqua or Graphite)" (p99).
   */
  focusRing: ['#C5D5E2', '#A8C8E2', '#8ABCE3'],

  /** The Aqua window body pinstripe, from the same lossless PNG. */
  bodyPinstripe: { a: '#E1E3E7', b: '#E4E6EA', period: 4 },

  scrollBar: {
    width: 15,
    /** The empty track, left to right: an inner shadow that brightens outward. */
    track: [
      '#C3CCD5', '#C3D2DA', '#C7D8E0', '#D1E0E7', '#DBE8EE', '#E3EDEF', '#EDF2F5',
      '#F4F7F8', '#F6F8FD', '#F8F9FC', '#FBFCFE', '#FDFDFE', '#FCFCFE', '#F8F8FD',
      '#EAF3F5',
    ],
    /** The scroller, across its 13px width inside the 15px track. */
    scroller: [
      '#215EB8', '#83C8FF', '#99E0FE', '#90DFF4', '#7EDFFE', '#50C6F1', '#5DD6FD',
      '#78E2FE', '#8FEAFD', '#9CF3F9', '#A3FDF9', '#ADF2F3', '#537C7F',
    ],
    /** Proportional, unlike System 1's fixed 16x16 square. */
    proportional: true,
    /** Tiger places both arrows together at one end rather than splitting them. */
    arrowsTogether: true,
  },

  /**
   * Type. Apple documents seven roles for Lucida Grande, and Mac OS X drew at a
   * nominal 72 DPI — so every point size is that many pixels exactly. The
   * substitution is DejaVu Sans; see docs/fonts/tiger-README.md.
   *
   * **Regular weight only.** Bold is deferred until a surface needs it, and until
   * `lucida-bold-sub.woff2` exists nothing may ask for it — a browser would
   * synthesise a fake bold by smearing the regular outlines.
   */
  font: {
    family: '"Lucida Sub", "DejaVu Sans", sans-serif',
    /** Menus, dialogs, full-size controls, and window titles. */
    system: 13,
    /** Lists and tables. */
    view: 12,
    /** Help tags, column headings, small controls. */
    small: 11,
    /** Toolbar button labels, slider ticks. */
    label: 10,
    /** Mini controls, utility window labels. */
    mini: 9,
    weight: 400,
  },

  /**
   * Utility windows and modal dialogs, measured but not currently instantiated by
   * the window manager — Chronos has one frame class plus modals. Recorded because
   * the modal case *is* used: an alert has no title bar buttons at all.
   */
  utility: { titleBarHeight: 16, lightDiameter: 11, lightPitch: 18, insetLeft: 7 },
} as const

export const TIGER_PROVENANCE_EXTRA = {
  titleBar: {
    level: 'measured',
    source: FIG_13_3,
    note: 'Three specimens agree to within one unit on all 23 rows and every row is '
      + 'exactly neutral, which is what resolves the cool cast Figures 13-2 and '
      + '13-19 show as belonging to those bitmaps rather than to Aqua.',
  },
  titleBarInactive: {
    level: 'measured',
    source: FIG_13_19,
    note: 'Only one figure in the book shows an inactive window, so unlike the '
      + 'active bar there is no second crop to cross-check the cool cast against. '
      + 'The values are as measured, cast included.',
  },
  lights: {
    level: 'measured',
    source: `${FIG_13_3} Cross-checked in ${FIG_13_19} and ${FIG_13_22}.`,
    note: 'Geometry confirmed on 40+ button instances, all 14x14 with 21px pitch. '
      + 'rest and disabled artwork are measured; hover, active and focus appear in '
      + 'no figure and in no prose and are tagged unverified on the CSS side — see '
      + 'docs/eras/tiger.md §4. The horizontal component of the shading is measured '
      + 'in magnitude (~20 units centre to ring) but not reproduced.',
  },
  menuBar: {
    level: 'measured',
    source: FIG_12_12,
    note: 'The no-translucency correction is measured rather than asserted: two '
      + 'columns 420px apart inside the bar give identical per-row values, and the '
      + 'desktop below the rule is a different gradient. Translucency is 10.5.',
  },
  menu: {
    level: 'measured',
    source: `${FIG_12_11} Pinstripe corroborated losslessly in ${FIG_7_1}`,
    note: 'Item height reads 19-20px across seven pitch samples; 19 is the modal '
      + 'value. The separator slot reads 11-14px; 12 is the middle. Both spreads are '
      + 'JPEG plus the +/-1 of locating an ink top.',
  },
  dock: {
    level: 'unverified',
    source: FIG_10_1,
    note: 'The shelf FILL and HEIGHT are unknown, and that has a specific cause: '
      + 'Figure 10-1 crops the Dock onto the white page and Tiger\'s shelf is '
      + 'translucent, so it composited against the paper. Only the 1px divider '
      + '(#DFDFDF), the 1px edging (#DEDEDE) and the 47px icon survive. The 68px '
      + 'height and the 0.62 alpha are derived to look right at the measured icon '
      + 'size and are not measurements. A 1:1 Tiger desktop screenshot resolves both.',
  },
  focusRing: {
    level: 'measured',
    source: FIG_7_1,
    note: 'From the only lossless bitmap in the document, so these are exact rather '
      + 'than JPEG-derived. Apple documents the ring itself in prose (p99).',
  },
  bodyPinstripe: { level: 'measured', source: FIG_7_1 },
  scrollBar: {
    level: 'measured',
    source: FIG_13_22,
    note: 'Width 15px, matching the classic Aqua figure. The scroller is '
      + 'proportional — the direct opposite of System 1\'s fixed 16x16 square, and '
      + 'the same widget contract has to do both.',
  },
  font: {
    level: 'documented',
    source: 'Ibid. p119-120 and p200 — the seven Lucida Grande roles in prose. That '
      + '1pt = 1px follows from Mac OS X drawing at a nominal 72 DPI, and is checked '
      + 'against the figures: the menu bar title inks a 10px caps-and-ascenders band '
      + 'where 13px predicts ~10 and a 96 DPI reading would predict ~13.',
    note: 'Face substituted: DejaVu Sans for Lucida Grande, within +/-6.3% of '
      + "Apple's own rasterisation across five strings. Regular weight only. "
      + 'docs/fonts/tiger-README.md.',
  },
  utility: {
    level: 'measured',
    source: `${FIG_13_19} and ${FIG_13_3}`,
    note: 'A utility window is 16px with 11px lights on 18px centres. Apple '
      + 'documents that alerts and modal dialogs carry no title bar buttons at all '
      + '(p174), which is the part Chronos uses.',
  },
} as const satisfies Record<keyof typeof TIGER, { level: string; source: string; note?: string }>
