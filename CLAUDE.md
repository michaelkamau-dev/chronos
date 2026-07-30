# Chronos — Working Rules

## Hard rules
- No new runtime dependencies. Ask first, always.
- No React, no Tailwind, no component libraries. Vanilla TS + CSS.
- Never write TODO, FIXME, placeholder, stub, or "in a real implementation."
  If it can't be finished now, stop and tell me why.
- Never simplify or remove existing behavior to make a new feature easier.
  Flag the conflict instead.
- Never claim something works without running it.

## Fidelity rules
- Chrome dimensions are measured values, not eyeballed. Unverifiable value →
  comment it as unverified rather than inventing a number.
- Every interactive element ships all five states: rest, hover, active,
  focus, disabled.
- Every mouse interaction has a keyboard path.
- Era styling lives only in the skin layer. Zero era conditionals inside app
  logic or the window manager.

## Performance rules
- Window movement uses transform only. Never top/left. Never layout-triggering
  properties in a drag loop.
- No allocation inside rAF callbacks.
- One delegated listener per event type on the root, not per window.

## Architecture invariants
- Window manager knows nothing about apps. Apps know nothing about eras.
- Filesystem is the single source of truth. No app holds duplicate state.
- All persistence flows through the FS layer. No direct IndexedDB calls
  outside it.

## Mistake log
Append every correction I make here as a permanent rule. Never delete entries.

- A speculative era needs a premise, not a style. Before designing anything,
  answer: what hardware or social change makes this necessary, what does it get
  wrong (its Clippy, its Aqua overgloss, its ribbon), and what did it delete that
  people loved. Dark glass, blur, glow, floating translucent panels and thin
  geometric sans are 2015 concept-render defaults and read as stock. If it would
  look at home in a phone ad, restart. Strange and slightly wrong beats safe.
- Do not build on an unresolved font. Name the specific substitute face and show
  a rendered comparison at the sizes the era actually uses before building any
  chrome that depends on it.
- A pixel-comparison gate requires a reference. Do not schedule one without the
  1:1 source material in hand.
- Accessibility obligations are media queries, not user preferences. An era's
  hostile behaviour may never be the thing that blocks an accessibility escape
  hatch. `prefers-reduced-motion` governs the Ledger refresh band; the Steward
  stays undisableable.
- Suspend/resume is a correctness requirement, not a lifecycle nicety. Every app
  must survive `suspend()`/`resume()` with full state intact, verified per app.

### Brief corrections (verified against primary sources — see docs/ARCHITECTURE.md §7)
- Windows XP's Luna caption font is Trebuchet MS Bold 10pt. Tahoma 8pt is the
  menu/message/dialog font. Floating palettes are Verdana Bold 8pt.
- The 3px Luna border is three discrete 1px colour steps, asymmetric between
  top/left and bottom/right — not a gradient. Six stacked inset box-shadows.
- Luna buttons do not shift 1px on mousedown; they swap the background gradient.
  The 1px label shift is classic-Windows behaviour, correct for Win 3.1 only.
- Windows 3.1 has no four-colour 3D bevel. COLOR_3DDKSHADOW and COLOR_3DLIGHT
  are Windows 95 additions. 3.1 is a three-colour bevel plus a black frame.
- System 1 windows have a 1px drop shadow on the right and bottom only, giving a
  notched top-right corner and an asymmetric frame (1px left/top, 2px
  right/bottom). Classic Mac scroll thumbs are fixed 16×16 squares, never
  proportional.
- `system.css` and `98.css` are not dimensional references. 98.css's bitmap font
  is a conversion of Microsoft's actual MS Sans Serif — do not inherit it.
- The Windows XP startup sound is by Bill Brown and Tom Ozanich. Brian Eno wrote
  the Windows 95 sound.

### Windows XP — primary source overrides recreations (docs/sources/winxp-luna-metrics.md)
- XP command buttons are 75×23px and their corner is **a 1 pixel indent, not a
  radius**. Microsoft's exact words: "The curve of a command button is a 1 pixel
  indent." §7's `radius 3px` came from XP.css and is that project's
  interpretation. Build to the 1px indent.
- §7's caption gradient endpoints (`#0997ff`, `#003dd7`, from XP.css) do **not**
  appear in Microsoft's published window-frame palette (`#0062EA`, `#14A5F4`,
  `#081BCB`, `#4977B4`). Microsoft calls its list a sample because Luna is
  gradient-heavy, so this is unresolved either way — it needs `luna.msstyles`.
  Treat the published set as anchor points and the XP.css stops as unverified.
- XP uses **four** faces, not one: Tahoma 8/9/11pt (system default, only those
  three sizes), Trebuchet MS Bold 10pt (window title bars only), Verdana Bold 8pt
  (floating palette captions only), Franklin Gothic Medium 14pt+ (headers only,
  21pt in Control Panel titles, never body text).
- Two disabled grays, separately specified and not to be unified: controls
  `#A1A192`, menus `#808080`. Disabled fills also differ — text boxes `#EBEBE4`,
  combo boxes `#C9C7BA`.
- XP's navigation buttons are semantically coloured: red is high-impact, blue is
  neutral, green starts an action, yellow is less severe than red. So the caption
  buttons are **not a uniform set** — close is red by category, minimize and
  maximize are blue.
- Point sizes are not pixel sizes. 8pt at 96dpi is 10.667px; Windows rasterised
  it at 11px. Never write `pt` in a stylesheet — resolve to the integer pixel the
  era actually rendered (11 / 12 / 15 / 13 / 19 / 28). Only 9pt and 21pt land on
  whole pixels.
- `github.io` is **not** reachable from the build sandbox — it is refused at the
  proxy like any non-allowlisted host. `raw.githubusercontent.com` is allowlisted,
  and a `*.github.io` site is served from a repository, so fetch the raw file from
  the backing repo instead.

### Figure extraction and measurement
- A figure captioned "in actual size" is 1:1 only in its **embedded bitmap**.
  Rasterising the PDF page resamples it and destroys the measurement. Extract the
  image XObject, never render the page.
- A figure's page-placement scale says nothing about its bitmap scale. XP's window
  figure is placed at 1.38 px/pt and Tiger's at 1.538 and 1.25 — none of them 96/72.
  Ignore placement; measure the bitmap.
- Calibrate scale against a documented element in the same document before trusting
  a figure. Tiger's three push buttons measure 16/22/19px against documented
  15/20/17px "not including the shadow" — that is what establishes 1:1, and the
  shadow is why the raw bbox is 1–2px larger than the spec.
- Source figures are JPEG. Find boundaries by change detection, not exact colour
  match, and sample colour from the middle of a run. A JPEG-derived hex value is
  `measured`, never `documented`.
- Sample a gradient as the **median of qualifying pixels per row**, not down a fixed
  column: any single column through a caption eventually crosses the window icon or
  the title text and reports those as gradient.
- XP.css's Luna frame is **3px because it missed the outermost step**. Microsoft's
  1:1 figure shows four: `#0019CE` `#0831D9` `#166AEE` `#0955DE`. Caption height is
  30px, not 28px, and the corner is a 5-row arc (insets 5,3,2,1,1,0), not an 8px
  radius.
- Do not infer a glyph's letterform from its contour count. Cabin, Source Sans 3 and
  Open Sans all report three contours on lowercase `g` and are all **single-storey**
  — a tail terminal can close as its own contour. Render it and look.

### Structural rules do not belong to a skin (audit before phase 4)
- A rule that must be true in every era is not era styling, and putting it in a
  stylesheet means each of six skins can forget it. Extracting `base.css` after the
  y=-30 bug was reactive; the audit that followed found five more of the same kind
  already diverging — `contain`, `touch-action`/`user-select` on the drag origin,
  resize-handle positioning, the maximized-window handle suppression (XP had it, the
  plain skin did not), pointer-event suppression mid-gesture, and the overlay
  z-index constants. Ask "would a skin that omitted this be wrong?" before writing a
  rule into a skin.
- The same applies to code. The reduced-motion check lived in each skin's
  `minimizeTo`/`restoreFrom` — four copies, on the way to twelve — so honouring an
  accessibility obligation was something a skin could omit with no test failing. The
  window manager now refuses to call the animation at all when the query matches.
- A test that selects a skin's class name is coupled to that skin. `.menu` and
  `.menu-item` are the plain skin's classes, and the XP skin only kept those tests
  green by emitting `class="xp-menu menu"` — a second class whose only purpose was to
  satisfy a selector nothing enforced. Menus now carry `data-menu`,
  `data-menu-item`, `data-menu-separator` and `data-menu-submenu`, and a test asserts
  the active skin emits them.
- A perf gate must assert on the instrument that measures the claim. `over50 === 0`
  on raw rAF intervals fails when the container deschedules the whole renderer, which
  no change to the drag loop can prevent. The claim "our code never blocks" is
  measured by the long-task count; a stall we caused is by definition a long task.
  Diagnose an intermittent gate by running it, not by adjusting the number.

### Caption buttons — a second figure answered what the first could not
- "The magnifier callout covers it" was a statement about one figure, not about the
  document. A separate figure in the same chapter shows three real captions with
  nothing over the buttons, and it settled every value in one pass. Before recording
  something as unresolvable pending an external file, check whether another figure in
  the same source shows it.
- Calibrate a figure against values already measured elsewhere. This one reproduces
  the 30px caption and the 4px frame, both measured twice from a different bitmap,
  which is what establishes it as 1:1 — and the placement then divides exactly:
  6 + 21 + 3 = 30.
- Caption buttons are not vertically centred. Centring in a 30px caption computes
  4.5px and puts the whole button off the pixel grid.
- A specimen sheet's arrangement is the document's layout, not the OS's. The bottom
  row of the states figure spaces its five glyphs 3px apart and includes both
  maximize and restore, which cannot co-occur on a real title bar. The 2px gap comes
  from the real captions.
- `filter: brightness()` is not a state model. Measured: hover lifts the close
  button's red toward white, pressed darkens *and* saturates it, disabled removes the
  hue entirely. No single multiplier is all three — each state is its own artwork.
- When solving for a compositing alpha yields a value above 1, the layer is not the
  base artwork at reduced opacity. The disabled specimens give 0.23 on the red and
  1.57 on the blue, which means separate artwork over an unknown background — so the
  values are `contested`, exactly like the caption gradient.

### Windows 3.1 (from the VGA captures)
- Disabled text is a **50% checkerboard knocked out of the black glyph**, for menu
  items and button labels alike. Not a grey fill, and not a grey fill with a white
  shadow — that is the Windows 95 treatment and it is what nearly every recreation
  uses. Same mechanism as System 1's `notPatBic`.
- Prove a stipple by parity, not by eye: ink on one `(x + y)` parity only means a
  checkerboard. The disabled OK label is 37 pixels all on one parity; the Cancel label
  beside it is 140 split 71/69.
- A greyed button in a captured dialog is not necessarily pressed. 3.1's Run dialog
  disables OK until the command line has content, so that capture gives the disabled
  state and leaves the 1px-depress question open.
- The 3.1 push-button bevel is **2px** highlight and **2px** shadow, not 1px, and its
  black outline has notched corners so it is not a plain `border`.
- A 3.1 edit field is a plain 1px black rectangle with a white fill. The sunken
  two-tone field is a Windows 95 feature.
- A 3.1 modal dialog has its own frame, not the window sizing frame: 1px black + 4px
  navy + 1px white on the sides, 3px of navy on top, and no white line at the bottom.
- **Windows 3.1 uses one face for the whole era** — `SYSTEM.FON`, bold, 2px stems, 9px
  cap height — for captions, the menu bar, menu items, dialog labels and button
  labels. MS Sans Serif is a separate face 3.1 also shipped and our chrome never
  touches. W95FA is an OFL recreation of the **Windows 95** MS Sans Serif bitmap:
  right licence, wrong face, one era too late. §7's single "System / MS Sans Serif"
  row was two needs collapsed into one.
- Two equal-width strings cannot tell a right-aligned column from a fixed left one.
  `Ctrl+F4` and `Ctrl+F6` are the same width, so the menu accelerator column's
  alignment is a standard-behaviour assumption, not a measurement.
