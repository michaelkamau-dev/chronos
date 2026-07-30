/**
 * Mac OS 8 Platinum — measured chrome metrics.
 *
 * Source: the *Mac OS 8 Human Interface Guidelines* (Apple, 9/2/97), read as the
 * appearance authority, over the classic *Macintosh Human Interface Guidelines*
 * (1992) as the geometry authority — the OS 8 book is an addendum that defers window,
 * scroll bar and text field specifications to the classic book by name. Extraction
 * method, per-value evidence and the open items are in `docs/eras/macos8.md`.
 *
 * This era is better sourced than either of phase 3's, for two reasons worth stating
 * where the numbers live:
 *
 * 1. **The figures are lossless.** XP's and Tiger's are JPEG, so every colour taken
 *    from them carries compression error. Apple's are PNG and raw indexed bitmaps with
 *    declared palettes, so a hex value here is Apple's exact byte. Several are read
 *    straight out of the PDF's colourspace objects rather than sampled from pixels.
 * 2. **The values that no prose states live in inline images**, which
 *    `page.get_images()` does not report at all. `tools/pdf-extract/extract-inline.py`
 *    exists because of that, and the scroll bar and the tool palette came out of it.
 *
 * Three findings here contradict what a plausible recreation would produce:
 *
 * - **Platinum kept System 1's drop shadow.** 1px hard, right and bottom only, offset
 *   two rows down at the top-right so the corner is notched. Thirteen years apart and
 *   the same shadow.
 * - **The frame's highlight and shadow swap sides.** Left/top runs black → white →
 *   face → grey → black; bottom/right runs black → grey → face → white → black. One
 *   set of CSS variables for both edges gets two of the four sides wrong.
 * - **The disabled-text stipple is gone.** System 1 and Windows 3.1 both knock a 50%
 *   checkerboard out of the glyph; Platinum uses a solid `#888888`, proven by parity
 *   rather than by eye. A skin that inherited System 1's stipple would read as four
 *   years out of date.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'

const FIG_5_1 =
  'Mac OS 8 HIG p100 Figure 5-1 "Active window vs inactive window", embedded PNG ' +
  '435x233 at native size. docs/sources/figures/macos8-windows-active-inactive.png'

const FIG_5_3 =
  'Mac OS 8 HIG p102 Figure 5-3 "Structural components of standard document windows", ' +
  'embedded PNG 405x217 at native size. docs/sources/figures/macos8-window-parts.png'

const FIG_5_6 =
  'Mac OS 8 HIG p104 Figure 5-6 "Window in normal and collapsed states", embedded PNGs ' +
  '208x159 and 232x23. docs/sources/figures/macos8-window-{normal,collapsed}.png'

const FIG_4_1 =
  'Mac OS 8 HIG p091 Figure 4-1 "Menu bar using platinum appearance", embedded PNG ' +
  '256x165. docs/sources/figures/macos8-menubar.png'

const FIG_2_26 =
  'Mac OS 8 HIG p040 Figure 2-26 "A horizontal scroll bar", INLINE image 140x19, raw ' +
  '8-bit indices with a declared 16-entry palette — no lossy step anywhere. ' +
  'docs/sources/figures/macos8-scrollbar-h.png'

const PROSE = 'Mac OS 8 HIG prose; see docs/sources/macos8-platinum-metrics.md'

export const MACOS8_METRICS: ChromeMetrics = {
  /**
   * 19px, and it is the best-corroborated number in the project: Apple's prose states
   * it twice (classic HIG p162, restated in the OS 8 addendum p103), `StandardWDEF.a`
   * carries `minTitleH EQU 19`, and it measures 19 rows in four separate figures.
   */
  titleBarHeight: 19,
  /**
   * Unchanged when inactive. The fill goes flat and the frame lines lighten, but the
   * outer-frame-to-content distance is 22px in both states, so the drag region does
   * not move — which matters because a changing title bar height would shift the
   * content area on every focus change.
   */
  titleBarHeightInactive: 19,
  /**
   * 6px per side, as six discrete 1px steps. The top is 1px of black and then the
   * title bar, so `top` carries only the frame line; the WM adds `titleBarHeight`.
   */
  border: insets(1, 6, 6, 6),
  /** Square. Rounded window corners are an Aqua idea; Platinum frames are rectangles. */
  cornerTop: { kind: 'radius', px: 0 },
  /**
   * The frame is 6px and genuinely grabbable, but the classic Mac did not size from
   * its frame at all — it sized from the grow box only. Chronos gives every era eight
   * handles because the brief requires them, so this is the frame width rather than a
   * modern slop, and the anachronism is recorded in the provenance note.
   */
  resizeGrab: 4,
  /** 1px on the right and bottom. Painted, never hit-tested. */
  shadowInsets: insets(0, 1, 1, 0),
  /**
   * The Finder staggered new windows down and right. A static figure cannot show a
   * cascade, so this is unverified; 20px matches the documented Tiger offset, which is
   * the closest Apple-sourced value available.
   */
  cascadeStep: 20,
  dragGrabMargin: 48,
  /**
   * Classic Mac **zoom**, not fill. The zoom box toggles to the content's natural size
   * rather than filling the screen — a different gesture, which is why the WM
   * implements both. Apple documents three variants (full, horizontal, vertical) at
   * p104; the full variant is what the chrome emits.
   */
  maximizeSemantics: 'zoom',
  /**
   * Windowshade. The content region hides and the title bar stays visible and active
   * (p103). This is the one era the WM's `collapse` style exists for.
   */
  minimizeStyle: 'collapse',
}

export const MACOS8_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: {
    level: 'documented',
    source: `${PROSE} (p103); measured in ${FIG_5_1}, ${FIG_5_3} and ${FIG_5_6}`,
    note: 'Documented in Apple prose twice and measured as 19 rows in four figures. '
      + 'Rows 0..18 of the bar: FFFFFF highlight, 2x CCCCCC, twelve rows of stripes, '
      + '4x CCCCCC. The 999999 and 000000 rows below it are frame, not title bar.',
  },
  titleBarHeightInactive: {
    level: 'measured',
    source: FIG_5_1,
    note: 'Figure 5-1 shows both states side by side. Outer frame line to content is '
      + '22px in each, so the height is unchanged; only the lighting differs.',
  },
  border: {
    level: 'measured',
    source: `${FIG_5_3}; confirmed independently in ${FIG_5_1}`,
    note: 'Six 1px steps. Left/top outer->inner 000000 FFFFFF CCCCCC CCCCCC 999999 '
      + '000000; bottom/right outer->inner 000000 999999 CCCCCC CCCCCC FFFFFF 000000 '
      + '— the highlight and shadow swap. Top is 1px because the title bar follows it.',
  },
  cornerTop: {
    level: 'measured',
    source: FIG_5_3,
    note: 'Square in all four corners. The only corner treatment is the shadow notch '
      + 'at the top right, which is a shadow offset rather than a frame shape.',
  },
  resizeGrab: {
    level: 'derived',
    source: 'Set to two-thirds of the 6px frame so the grab region sits inside the '
      + 'visible frame rather than over the content.',
    note: 'A knowing anachronism, flagged rather than hidden: the classic Mac sized '
      + 'only from the grow box and had no resizable frame edges at all. Chronos '
      + 'requires eight handles in every era, so the frame becomes grabbable here.',
  },
  shadowInsets: {
    level: 'measured',
    source: FIG_5_3,
    note: 'Column x=403 is 000000 for all 217 rows (the frame); x=404 is FFFFFF for '
      + 'rows 0-1 then 000000 from row 2 down. That is a 1px hard shadow on the right '
      + 'and bottom, offset two rows down, notching the top-right corner — the same '
      + 'construction as System 1.',
  },
  cascadeStep: {
    level: 'unverified',
    source: 'Not measurable from a static figure.',
    note: 'A single screenshot cannot show a cascade. 20px is the documented Tiger '
      + 'offset, used here for want of an OS 8 source; the real Finder value is unknown.',
  },
  dragGrabMargin: {
    level: 'unverified',
    source: 'Not measurable from a static figure.',
    note: 'How much of a window the Finder kept reachable while dragging cannot be '
      + 'seen in a still. 48px is a usability floor, not a measurement.',
  },
  maximizeSemantics: {
    level: 'documented',
    source: `${PROSE} (p104)`,
    note: 'Apple describes the zoom box as toggling window size, with full, horizontal '
      + 'and vertical variants — not a fill. The WM implements zoom for this era.',
  },
  minimizeStyle: {
    level: 'documented',
    source: `${PROSE} (p103-104); measured in ${FIG_5_6}`,
    note: 'The collapse box hides the content region and leaves the title bar visible '
      + 'and active. Figure 5-6 shows the collapsed window: 23px total, being 1px '
      + 'frame, 19px title bar, the 999999+000000 pair, and 1px of bottom frame.',
  },
}

/**
 * Colours, control geometry and text metrics beyond what the WM needs.
 *
 * Every hex here is exact rather than approximate. The figures are PNG and raw
 * indexed bitmaps, and several palettes were read out of the PDF's own colourspace
 * objects — so unlike the XP table, there is no JPEG error to allow for.
 */
export const MACOS8 = {
  /**
   * The Platinum grey ramp.
   *
   * These are not arbitrary samples: `#DDDDDD`, `#CCCCCC`, `#BBBBBB`, `#AAAAAA`,
   * `#888888` and `#777777` are declared palette entries in the 4-bit and 8-bit
   * indexed figures, which is stronger evidence than reading them off pixels.
   */
  palette: {
    /** Content region, and every highlight edge. */
    white: '#FFFFFF',
    /** Frame lines, text, and the boxes' outlines on an active window. */
    ink: '#000000',
    /** Active title bar fill. */
    titleFace: '#CCCCCC',
    /** Menu bar and menu popup fill — lighter than the title bar. Do not unify. */
    menuFace: '#DDDDDD',
    /** Title bar stripe shadow, and the grow box grip lines. */
    stripeShadow: '#777777',
    /** Frame inner shadow step, and the menu bar's lower bevel row. */
    shadow: '#999999',
    /** Disabled text, the boxes' upper-left chisel, and the menu separator rule. */
    dim: '#888888',
    /** The boxes' 11x11 body outline. Not pure black — measured 222222. */
    boxBody: '#222222',
    /** Inactive window frame lines. Grey, not black. */
    inactiveInk: '#555555',
    /** Inactive title bar fill, flat. */
    inactiveFace: '#DDDDDD',
    /** Inactive title text. */
    inactiveText: '#666666',
    /** Scroll bar track fill. */
    trackFill: '#AAAAAA',
    /** A scroll bar with nothing to scroll: flat, no arrows, no thumb. */
    trackEmpty: '#EEEEEE',
  },

  /**
   * The title bar's six racing stripes.
   *
   * System 1 drew six 1px-on/1px-off black lines; Platinum draws the same six bands as
   * a white highlight over a `#777777` shadow on a `#CCCCCC` bar. The count survived
   * thirteen years — this is the single strongest continuity tell in the era.
   *
   * `firstRow` is the offset from the title bar's own top row, so the pattern's phase
   * is explicit. A pattern that starts on the wrong row is visibly wrong even when the
   * period is right.
   */
  stripes: {
    count: 6,
    firstRow: 3,
    highlight: '#FFFFFF',
    shadow: '#777777',
    /** Rows above the first stripe that stay flat, after the highlight row. */
    leadRows: 2,
    /** Rows below the last stripe that stay flat. */
    tailRows: 4,
    /** The stripes stop this far clear of the title's ink on each side. */
    textClearance: 4,
  },

  /**
   * Close, zoom and collapse boxes — identical construction, 13x13 footprint.
   *
   * `3 + 13 + 3 = 19` exactly, so unlike XP's caption buttons these are genuinely
   * centred and still land on the pixel grid. Odd bar, odd box, integer result.
   */
  box: {
    /** Footprint including the chisel. */
    size: 13,
    /** The dark outline inside the chisel. */
    body: 11,
    /** From the window's outer frame edge, left and right (excluding the shadow). */
    edgeInset: 4,
    /** From the title bar's top and bottom rows. */
    topInset: 3,
    /** Between the zoom box and the collapse box. */
    gap: 3,
    /** Upper-left chisel. */
    chiselDark: '#888888',
    /** Lower-right chisel. */
    chiselLight: '#FFFFFF',
    /**
     * The interior is a diagonal gradient, lighter toward the bottom right, not a flat
     * well. Six steps, measured down a column through the close box.
     */
    interior: ['#999999', '#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD', '#EEEEEE'],
  },

  /**
   * Scroll bars.
   *
   * 16px, which is the classic Mac value this project already recorded for System 1 —
   * so Platinum changed the appearance and kept the geometry, exactly as it did for
   * the title bar. Measured 16px in two separate windows.
   *
   * Figure 2-26, the standalone specimen, is **19px** and its arrow box is 16x19 and
   * therefore not square. It is raw indexed data, so that is not a rescale artefact;
   * it is a specimen drawn thicker than the control ships. Recorded as contested in
   * `docs/eras/macos8.md`, resolved to 16px here because only an assembled window
   * gives real geometry. Figure 2-26 remains the authority on construction, being the
   * only figure that shows an active bar with both arrows and a thumb.
   */
  scrollBar: {
    thickness: 16,
    /** Square, at the scroll bar's thickness. */
    arrowBox: 16,
    /** Across the track, from the outer line inward. */
    trackEdgeNear: ['#777777', '#888888'],
    trackEdgeFar: ['#BBBBBB', '#CCCCCC'],
  },

  /**
   * The accent colour, as a five-step ramp.
   *
   * Apple states the scroll indicator "takes the color set by the user through the
   * Appearance control panel" (p40) and that the default focus ring is lavender (p66).
   * Two figures show two different accents, which is what proves it is a variable
   * rather than a constant — so the skin ships it as custom properties.
   *
   * The greens are read out of Figure 2-26's declared 16-entry palette, not sampled.
   */
  accent: {
    lavender: ['#CCCCFF', '#9999FF', '#6666CC', '#333399', '#000044'],
    green: ['#CCFFCC', '#66FF99', '#33CC66', '#339966', '#006633'],
  },

  /** Menu bar: 20px, and Platinum kept the classic Roman-script height. */
  menuBar: {
    height: 20,
    highlightRow: '#FFFFFF',
    face: '#DDDDDD',
    shadowRow: '#999999',
    ruleRow: '#000000',
  },

  /**
   * Menus.
   *
   * The 16px item height is exactly Chicago 12's documented 16px overall height
   * (p70), so a menu item is one line box — which is a satisfying independent
   * corroboration of both numbers rather than a coincidence.
   *
   * The separator confirms Apple's separator prose — "the top pixel is the line, the
   * bottom pixel is the engrave" (p50) — and supplies the two colours the prose omits.
   */
  menu: {
    itemHeight: 16,
    separatorHeight: 6,
    separatorRuleOffset: 2,
    separatorRule: '#888888',
    separatorEngrave: '#FFFFFF',
    /** 1px, on the right. Same asymmetric idea as the window frame's shadow. */
    shadow: 1,
    shadowColor: '#222222',
    /** The pulled-down menu title. Not a plain inversion. */
    titleHighlight: '#333399',
    titleHighlightTop: '#6666CC',
    titleHighlightBottom: '#000088',
    titleHighlightText: '#FFFFFF',
    disabledText: '#888888',
  },

  /**
   * Disabled text is a **solid grey**, not a stipple.
   *
   * This is the one place Mac OS 8 breaks with System 1, and it is easy to get wrong
   * in the other direction: `CLAUDE.md` records the 50% checkerboard as a cross-era
   * fact, and it is — for System 1 and Windows 3.1. Platinum abandons it, for the same
   * reason Windows 95 did: the stipple existed because a 1-bit or 4-bit display has no
   * lighter black, and by 1997 8-bit colour is assumed.
   *
   * Proven by parity, using the same discriminator that proved the checkerboard in
   * Microsoft's bitmap: the disabled `Undo` label is 127 ink pixels split 64/63 across
   * `(x + y)` parity, and its accelerator is 66 split 33/33. A checkerboard puts 100%
   * on one parity. The glyph artwork is also unchanged — `Undo` and `Copy` are both
   * four glyphs of 6px ink — so only the ink colour differs.
   */
  disabledText: { mode: 'solid', color: '#888888' },

  /**
   * Type.
   *
   * Charcoal shipped; Chicago is the metric basis and Apple states Charcoal is based
   * on Chicago's metrics (p17). ChicagoFLF at **12px** reproduces Apple's own
   * rasterisation: cap height 9.00px against a measured 9px, x-height 7.00px against
   * 7px, and `Active window` rendering at exactly the 95px ink extent measured in
   * Figure 5-1. Mean per-glyph ink error across three figures is 0.02px.
   *
   * `lineBox` is set explicitly rather than left to the font: Chicago 12's documented
   * overall height is 16px (p70), and ChicagoFLF's own ascent/descent/lineGap compute
   * to about 15.3px at 12px, so relying on the font's metrics would lose a pixel on
   * every menu item.
   *
   * The symbol glyphs are in the private use area at `U+E000` + the classic Chicago
   * character code, because ChicagoFLF has no `U+2318`. Verified by rasterising each
   * one rather than trusting the glyph names.
   */
  font: {
    family: 'Chicago Sub',
    size: 12,
    lineBox: 16,
    capHeight: 9,
    xHeight: 7,
    /** Cap-band top offset from the title bar's own top row; baseline is at +14. */
    titleInkTop: 5,
    titleBaseline: 14,
    symbols: {
      /** DC1 / classic 0x11 — the command propeller. */
      command: '',
      /** DC2 / classic 0x12. */
      check: '',
      /** DC3 / classic 0x13. */
      diamond: '',
      /** DC4 / classic 0x14. */
      apple: '',
    },
  },
} as const

export const MACOS8_PROVENANCE_EXTRA = {
  palette: {
    level: 'measured',
    source: `${FIG_5_3} (15 distinct colours), ${FIG_5_1} (13), ${FIG_4_1}`,
    note: 'Exact rather than approximate: the sources are PNG and raw indexed bitmaps, '
      + 'and the grey ramp entries are declared palette values read from the PDF '
      + 'colourspace objects. The low distinct-colour counts are also the evidence '
      + 'that nothing was resampled.',
  },
  stripes: {
    level: 'measured',
    source: `${FIG_5_3}; confirmed in ${FIG_5_1} and ${FIG_5_6}`,
    note: 'Six pairs across twelve consecutive rows, proven by period rather than by '
      + 'eye: shadow rows and highlight rows each occupy one class of (row - 3) mod 2 '
      + 'and no rows outside 3..14 carry either colour.',
  },
  box: {
    level: 'measured',
    source: `${FIG_5_3}; close box confirmed in ${FIG_5_1} and ${FIG_5_6}`,
    note: 'Two figures give the same 13x13 footprint and the same 4px edge inset, and '
      + '3 + 13 + 3 closes on the 19px bar in both.',
  },
  scrollBar: {
    level: 'contested',
    source: `${FIG_5_3} and ${FIG_5_1} give 16px; ${FIG_2_26} gives 19px`,
    note: '16px in two assembled windows, with a square 16x16 arrow box, matching the '
      + 'classic value. The 19px standalone specimen is not a rescale — it is raw '
      + 'indexed data — so both readings are real and only the window one is the '
      + 'shipping control. Resolved to 16px; see docs/eras/macos8.md section 5.',
  },
  accent: {
    level: 'measured',
    source: `${FIG_2_26} declared palette (green); ${FIG_5_3} thumb (lavender); `
      + `${PROSE} p40 and p66`,
    note: 'Two figures show two different accents, which is the proof it is a user '
      + 'variable rather than a constant. Lavender is the documented default.',
  },
  menuBar: { level: 'measured', source: FIG_4_1 },
  menu: {
    level: 'measured',
    source: FIG_4_1,
    note: 'Item height from five consecutive 16px pitches. The 16px matches Chicago '
      + "12's documented 16px overall height, so an item is one line box.",
  },
  disabledText: {
    level: 'measured',
    source: FIG_4_1,
    note: 'Parity, not appearance: disabled Undo is 127 ink pixels split 64/63 on '
      + '(x + y), its accelerator 66 split 33/33. A checkerboard is 100% on one '
      + 'parity, which is how Windows 3.1 was proven. Platinum is a solid fill.',
  },
  font: {
    level: 'measured',
    source: `${PROSE} p17 and p70 for Chicago 12; ${FIG_5_1} and ${FIG_5_6} for the `
      + 'rasterisation. Sheet at docs/fonts/macos8-chicago.png',
    note: 'ChicagoFLF at 12px matches Apple\'s pixels to a mean 0.02px ink error. '
      + 'Figure 5-3 is Charcoal rather than Chicago — t and v each 1px wider, every '
      + 'other glyph identical — which is Apple\'s "Charcoal shares Chicago\'s '
      + 'metrics" measured rather than assumed. Substitution and its stated visual '
      + 'loss in docs/eras/macos8.md section 7.',
  },
} as const satisfies Record<keyof typeof MACOS8, { level: string; source: string; note?: string }>
