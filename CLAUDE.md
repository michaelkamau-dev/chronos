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

### The stipple is a cross-era fact, not a Win 3.1 detail
- System 1's `notPatBic` and Windows 3.1's `GrayString` are the same construction:
  draw the glyph, then knock a 50% checkerboard out of it. Two competing vendors, eight
  years apart, converged — because on a 1-bit or 4-bit display there is no lighter
  black, so removing half the pixels is the only way to say "unavailable". Windows 95
  replaced it with a grey fill plus a white shadow as soon as 8-bit colour was assumed,
  which is why almost every recreation of *either* era is wrong. Recorded in
  ARCHITECTURE.md §7 under its own heading because it governs two skins.
- It is the strongest reason for the integer-scaled viewport, stronger than type
  crispness: a one-pixel checkerboard at a fractional scale averages into exactly the
  flat grey it exists to disprove.
- Assert the mechanism, not the appearance. The parity test that proves it in
  Microsoft's bitmap is the same test that proves it in our render, so the source and
  the implementation are held to one standard. System 1 reuses it unchanged.

### A perf gate must measure our work, not the host's scheduler
- `p95`/`p99` on rAF intervals are not ours to control. The identical 4x-throttled drag
  reported p99 16.80ms on one container generation and 50.00ms on the next, unchanged
  bundle, `longTasks=0` and `layouts=1` in both. Reproducing it on the commit *before*
  the day's work is what established it as the host.
- "Is every long interval a whole multiple of vsync" looks like the right discriminator
  and is useless: the compositor only delivers rAF on vsync boundaries, so every
  interval is a multiple whether we caused it or not. An injected 7ms-per-frame block
  produced zero off-grid intervals. A guard that cannot fail is not a guard — test that
  a new instrument can fail before trusting it.
- What works is per-frame cost from CDP: `ScriptDuration / frames` and
  `LayoutDuration / frames`. Frame count and percentiles fall when the host is busy;
  script time per frame does not, because it measures how long our code ran rather than
  when it was allowed to run.

### Mac OS X Tiger — the measurement was wrong before the reading was
- An Aqua window sits on a **drop shadow**, and the shadow ramps in 30-to-40-unit steps
  — the same size as the threshold a naive edge finder uses. So "the first step greater
  than 30" stops on the shadow, three pixels outside the window, and every inset
  measured from it comes out 3px large. That is where §7's 13px traffic-light inset came
  from; the real value is 9px and five figures agree. Find a frame line by the
  **largest** step, not the first one over a threshold: the frame steps by 217 where the
  shadow steps by 40.
- A saturation test finds a coloured thing and stops at its dark outline — and cannot
  see a grey one at all. That is why Tiger's lights measured 12px instead of 14px, and
  why the disabled state was recorded as unmeasurable when it was sitting in the figure.
  Test for **contrast against the local background**, which finds every state.
- An edge must be found on a **median profile across the whole width or height**. A
  frame line and a separator span the window; a traffic light, a proxy icon, a title
  string and a toolbar lozenge do not. Probing one column put a separator on the toolbar
  control and read it as Aqua blue.
- **A title bar string is not alone in its band.** Measuring the ink span of a window
  title picked up the proxy icon sitting to its left and made a 63px regular-weight
  string look like a 78px bold one. Split an ink span into runs before trusting its
  width.

### When figures disagree, look for the reading that explains the disagreement
- Two Tiger figures show the title bar with a 4-to-9 unit cool cast and one shows it
  exactly neutral. The rule from Luna's caption gradient would say ship it `contested`.
  But three separately cropped specimens agreeing on R = G = B across 23 rows cannot come
  from a tinted source, so the cast is those two bitmaps' compression and the bar is
  neutral. `contested` is the answer when no reading explains both, not the default when
  two numbers differ.
- **A 4-unit alternation in a JPEG is exactly what you would dismiss as noise**, and
  dismissing it is what every flat-fill Aqua recreation does. JPEG works in 8×8 blocks,
  so it gives an 8px period and a spread of values; Aqua's pinstripe is a 2-row period
  with exactly two greys. One figure in the Tiger HIG is a **lossless PNG**, and it shows
  the same construction — that is what licenses reading it out of the lossy ones. Look
  for a lossless bitmap in the source before calling a fine pattern an artefact.

### A point is a pixel on a Mac, and that is not an exception to the rule
- Mac OS X drew at a nominal 72 DPI, so Lucida Grande 13pt is 13px exactly — the inverse
  of the Windows trap where 8pt at 96 DPI is 10.667px and the era rasterised it at 11.
  The rule is unchanged: resolve to the integer pixel the era rendered and never write
  `pt` in a stylesheet, because CSS `13pt` still means 17.33px. Check the conversion
  against the source rather than assuming either direction — the measured 10px
  caps-and-ascenders band rules out the 96 DPI reading.
- **Antialiased type can be the era's own behaviour rather than a defect.** Apple
  documents that all interface text is anti-aliased, so Tiger is the first era that does
  not want the integer-scaled viewport, and §7's pixel-crisp rules do not apply to it.
  Do not carry a bitmap era's constraints into a vector era.

### The event that opens something must not reach what it opened
- DECISIONS 1.9 recorded this for right-click. It recurred twice in one menu bar: the
  pointerdown that opens a menu keeps bubbling to the capture layer that menu just
  pushed, lands outside the menu box, and dismisses it — and the Enter that opens it
  reaches the same layer and is read as "activate the highlighted item", so the menu
  fires its first command instead of opening. Stop the opening event. The keyboard case
  was found by a hung test and would otherwise have shipped a menu bar that looked
  correct in every screenshot and could not be used from the keyboard.
- **Set the open-state highlight after the menu opens, never before.** `MenuController.open`
  closes any existing menu first, and that close notifies watchers — which clears the
  attribute just written.

### Custom properties must be set where everything inherits from
- Generated properties were written on `.desktop`. Menus, the switcher and every overlay
  are hosted on the **root**, outside it — so a Tiger menu rendered with no background,
  no border colour, the browser's default serif at 16px and a 0px separator. Silent and
  total. The two Windows skins masked the same bug by also declaring every variable in a
  `:root` block, which means each measured value existed twice in the tree — exactly
  what generating them was meant to prevent. Write them once, on the root.

### An offset measured from an outer edge is not an offset from an inner one
- Apple's traffic-light insets are measured from the window's outer edge — the frame
  line's own row and column — and the element is positioned inside the frame, so each
  inset loses one border width. The first render put every light 1px right and 1px low.
  Write the subtraction as `calc(measured - hairline)` so the measurement stays the
  measurement, and check a render against the *source*, not against itself.

### A region that reserves space has to reserve it once
- The harness status strip claimed the bottom 24px by writing the display's reserved
  edges directly, which discarded everything the skin's regions had claimed — a menu bar
  and a Dock vanished from the work area. Reservations accumulate; one writer owns the
  total. And the elements need the same treatment: without offsetting regions by the
  other claims, the work area is right and the pixels are wrong, which is the worst of
  both.
