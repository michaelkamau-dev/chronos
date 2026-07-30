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
 * - **Platinum kept System 1's drop shadow.** 1px hard, right and bottom only, with
 *   BOTH free ends pulled in 2px so it is notched at the top-right *and* the
 *   bottom-left. Thirteen years apart and the same shadow. Its colour tracks the frame
 *   line: black on an active window, `#555555` on an inactive one.
 * - **The frame is two bevel rings, not four per-side stacks.** An outset ring and an
 *   inset ring around a 2px face, lit from one top-left source, generate all four
 *   sides. Enumerating six steps per side describes the same pixels and needs four
 *   hand-maintained lists that can drift.
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
   * The measured interior, not Apple's documented 19.
   *
   * Four figures give 22px from the outer frame line to the content and a 20px interior
   * between the two black lines. Apple's prose says 19px (p103, and classic HIG p162,
   * and `StandardWDEF.a`'s `minTitleH EQU 19`) — but no figure delimits 19 rows, both
   * candidates inside the interior cut through a bevel ring, and both sum to 22. So 19
   * is `documented` and 20 is what the pixels show; `border.top` 2 + 20 = 22.
   */
  titleBarHeight: 20,
  /**
   * Unchanged when inactive. The fill goes flat and the frame lines lighten, but the
   * outer-frame-to-content distance is 22px in both states, so the drag region does
   * not move — which matters because a changing title bar height would shift the
   * content area on every focus change.
   */
  titleBarHeightInactive: 20,
  /**
   * 6px on the sides and bottom. The top is 2 — one black line above the title bar and
   * one below it — so `border.top + titleBarHeight` is the measured 22px band.
   *
   * This is the **document window** frame. Utility windows and tool palettes measure
   * 4px with no 2px core, which is why the value is per-window-class rather than
   * era-wide; the skin's utility chrome declares its own.
   */
  border: insets(2, 6, 6, 6),
  /** Square. Rounded window corners are an Aqua idea; Platinum frames are rectangles. */
  cornerTop: { kind: 'radius', px: 0 },
  /**
   * The frame is 6px and genuinely grabbable, but the classic Mac did not size from
   * its frame at all — it sized from the grow box only. Chronos gives every era eight
   * handles because the brief requires them, so this is the frame width rather than a
   * modern slop, and the anachronism is recorded in the provenance note.
   */
  resizeGrab: 4,
  /**
   * 1px on the right and bottom. Painted, never hit-tested.
   *
   * Both free ends are pulled in 2px — the right column starts at frame-top + 2 and the
   * bottom row at frame-left + 2 — so the shadow is an L notched at the top-right *and*
   * the bottom-left. Its colour tracks the frame line rather than being black: #000000
   * active, #555555 inactive.
   */
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
    level: 'measured',
    source: `${FIG_5_3}; confirmed in ${FIG_5_1} and ${FIG_5_6}`,
    note: 'The measured quantities are 22px from the outer frame line to the content '
      + 'and a 20px interior between the two black lines: 1px bevel ring A, an 18px '
      + 'CCCCCC face, 1px bevel ring B. Apple\'s prose says 19px (p103) and that is '
      + 'documented, but no figure carries a boundary delimiting 19 rows — both '
      + 'candidates inside the interior cut through a bevel ring and both sum to 22, so '
      + 'the arithmetic cannot choose. 20 + border.top 2 = the measured 22, which is '
      + 'what the window manager needs; where Apple\'s 19 sits inside it is derived.',
  },
  titleBarHeightInactive: {
    level: 'measured',
    source: FIG_5_1,
    note: 'Figure 5-1 shows both states side by side: 22px outer line to content and a '
      + '20px interior in each. The active interior is bevelled and striped, the '
      + 'inactive one flat DDDDDD. Only the lighting differs — and the boxes, which an '
      + 'inactive window does not draw at all.',
  },
  border: {
    level: 'measured',
    source: `${FIG_5_3}; confirmed independently in ${FIG_5_1} and ${FIG_5_6}`,
    note: '6px on the sides and bottom, as two nested 1px bevel rings around a 2px '
      + 'CCCCCC core inside 1px black lines: ring A outset (FFFFFF top/left, 999999 '
      + 'bottom/right), ring B inset (999999 top/left, FFFFFF bottom/right). One light '
      + 'source, two rings — not four per-side stacks. Top is 2 because both black '
      + 'lines bracket the title bar and 2 + 20 = the measured 22px band. This is the '
      + 'DOCUMENT window frame: utility windows and tool palettes measure 4px.',
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
      + 'and active — which is why the window manager must not hide the frame for this '
      + 'style. Figure 5-6 shows the collapsed window: 23px total, being 1px frame, the '
      + '20px interior, 1px inner line, and 1px of bottom frame.',
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
    /**
     * A scroll bar with nothing to scroll, on an ACTIVE window. The arrows are still
     * drawn, in #888888 — see scrollBar.emptyActive. An inactive window's bar is white.
     */
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
    /**
     * The stripes stop clear of the title's ink. The clear zone is 46px against 37px of
     * ink and is offset one column between row types, so the slack is 5px on one side
     * and 4px on the other depending on which colour the row carries. Nine pixels of
     * total slack; a symmetric 4/4 describes a 45px zone that exists on neither row.
     */
    textClearance: 4,
    textClearanceLong: 5,
  },

  /**
   * Close, zoom and collapse boxes — one construction, 13x13, three glyphs.
   *
   * They are **not** identical: byte-differencing the three 13x13 blocks gives 11, 18
   * and 15 differing pixels, never zero. The chisel, the inner bevel and the ramp are
   * shared; the glyph is what distinguishes them, and the glyph is the point of the
   * widget. Close carries none, zoom a nested 7x7 outline, collapse two 9px rules.
   *
   * Five construction layers, not three — the inner bevel and its white corner pixel
   * are 16 pixels of a 167-pixel widget, and without them the dark ring lands straight
   * on the ramp.
   *
   * An **inactive window draws none of them at all**.
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
    /** Inner bevel, inside the dark outline. */
    innerBevelDark: '#888888',
    innerBevelLight: '#CCCCCC',
    innerCorner: '#FFFFFF',
    /**
     * A diagonal ramp over the 7x7 core — not the whole interior — in bands of constant
     * (col + row) two units wide. Seven steps: the brightest is a single `#FFFFFF`
     * pixel, and it is the one that makes the diagonal read as lit rather than as a
     * wash. Confirmed at 2x in Figure 5-7.
     */
    core: 7,
    interior: ['#999999', '#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD', '#EEEEEE', '#FFFFFF'],
    /** Utility windows and tool palettes carry the same three boxes at this size. */
    utilitySize: 10,
    utilityBody: 8,
  },

  /**
   * Scroll bars.
   *
   * 16px, which is the classic Mac value this project already recorded for System 1 —
   * so Platinum changed the appearance and kept the geometry, exactly as it did for
   * the title bar. Measured across **four figures and five instances**, including a
   * real list box (p039 Figure 2-25), which is the case that disposes of any "19px is
   * the list-box variant" reading.
   *
   * Figure 2-26's 19px is **not** a second right answer and is not `contested`. It is
   * the same 16px artwork stretched by +3 across the track only, by whole-row
   * duplication: along the track it matches to the pixel (arrow box 16, thumb 17),
   * across it every layer gains, and the extra rows land *inside* the black outlines
   * where no framing could put them. Duplication introduces no new colours, so the
   * distinct-colour test cannot detect it — that is the trap worth carrying forward.
   */
  scrollBar: {
    thickness: 16,
    /** Square, at the scroll bar's thickness. */
    arrowBox: 16,
    /** Across the track, from the outer line inward. */
    trackEdgeNear: ['#777777', '#888888'],
    trackEdgeFar: ['#BBBBBB', '#CCCCCC'],
    /**
     * Fixed-size, 16 across by 17 along — measured at three different track lengths and
     * byte-identical in two of them. Not the 16x16 square CLAUDE.md records for the
     * classic era. Whether it is truly fixed or proportional clamped at a 17px minimum
     * cannot be settled from figures alone.
     */
    thumbAlong: 17,
    /**
     * A bar with nothing to scroll still **draws its arrows**, in grey — the same glyph
     * artwork recoloured. Two distinct empty states, and neither is "no arrows".
     */
    emptyActive: { fill: '#EEEEEE', arrow: '#888888', divider: '#555555', line: '#000000' },
    emptyInactive: { fill: '#FFFFFF', line: '#555555' },
  },

  /**
   * The accent colour: **four** steps by role, plus two values that are not ramp steps.
   *
   * Apple states the scroll indicator "takes the color set by the user through the
   * Appearance control panel" (p40) and that the default focus ring is lavender (p66).
   * Two figures show two different accents, which is what proves it is a variable
   * rather than a constant — so the skin ships it as custom properties.
   *
   * Both ramps are measured inside thumb pixels rather than read off a declared
   * palette; the green budget closes to one pixel of the thumb's interior. The fifth
   * green a first reading would take (`#CCFFCC`) is a 4px grip cap whose structurally
   * identical lavender counterpart is a **grey** — a slot one accent fills with colour
   * and the other with grey is not a ramp step.
   */
  accent: {
    lavender: {
      highlight: '#CCCCFF', face: '#9999FF', grip: '#333399', shadow: '#6666CC',
      gripCap: '#EEEEEE', corner: '#EEEEEE',
    },
    green: {
      highlight: '#66FF99', face: '#33CC66', grip: '#006633', shadow: '#339966',
      gripCap: '#CCFFCC', corner: '#FFFFFF',
    },
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
    /**
     * 1px on the right AND the bottom, each free end pulled in 2px — the same notched L
     * as the window frame's shadow. A first reading caught only the right edge.
     */
    shadow: 1,
    shadowColor: '#222222',
    /** Item text ink, from the popup's interior left edge. */
    textInset: 16,
    /** Ink-to-ink gap between menu bar titles, constant across four gaps. */
    barTitleGap: 15,
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
    level: 'measured',
    source: `${FIG_5_3}, ${FIG_5_1} (two instances), ${FIG_5_6}, and p039 Figure 2-25 `
      + `— a real list box`,
    note: '16px across four figures and five instances, with a square 16x16 arrow box, '
      + 'matching the classic value. Not contested: Figure 2-26\'s 19px is the same '
      + 'artwork stretched +3 across the track only, by row duplication, with the extra '
      + 'rows inside the black outlines. A reading explains both numbers, so contested '
      + 'would be the wrong level. See docs/eras/macos8.md section 5.',
  },
  accent: {
    level: 'measured',
    source: `${FIG_5_3} and the list box at p039 Figure 2-25 (lavender, byte-identical `
      + `thumbs); ${FIG_2_26} (green); ${PROSE} p40 and p66`,
    note: 'Four steps by role, not five. Both ramps are measured inside thumb pixels — '
      + 'the green budget closes to one pixel of the interior — rather than read off a '
      + 'declared palette, which by this project\'s own rule is not proof of use. The '
      + 'fifth green (CCFFCC) is a 4px grip cap whose lavender counterpart is a GREY, '
      + 'so it is not a ramp step. 000044 was dropped: it is a bevel-button icon '
      + 'outline from a different chapter with a disjoint grey family. Two accents in '
      + 'two figures is the proof it is a user variable; lavender is the default.',
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
