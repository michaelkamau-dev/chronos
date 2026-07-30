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

### Mac OS 8 Platinum — the figures a PDF tool cannot see
- `page.get_images()` reports only a page's `/Resources /XObject` entries and **misses
  inline images entirely**. Three of the Mac OS 8 HIG figures carrying values no prose
  states are `BI/ID/EI` inline, so pages 40, 103 and 105 reported *zero* images and the
  scroll bar looked unavailable from the document. Before concluding a value is not in a
  source, check for inline images. `tools/pdf-extract/extract-inline.py`.
- **Lossless is not the same as authentic.** A PNG or raw-indexed figure gives the exact
  byte the PDF stores, which is a real advantage over XP's and Tiger's JPEGs — but one
  Mac OS 8 figure declares `#DEDEDE` and `#737373`, off the Mac 8-bit ramp of `0x11`
  multiples that every chrome figure uses. Check a palette against the era's ramp before
  quoting it; a lossless read of a colour-converted bitmap is as wrong as a lossy read of
  an authentic one.
- **The distinct-colour test cannot see a nearest-neighbour stretch.** Counting distinct
  colours proves a bitmap was not resampled with interpolation. Whole-row *duplication*
  introduces no new colours at all, and that is exactly what Figure 2-26 is: the 16px
  scroll bar stretched to 19 across the track only. The discriminator is **anisotropy** —
  it matches along the track to the pixel and gains on every layer across it — plus the
  extra rows landing *inside* the black outlines, where no framing could put them.
- **`contested` is for when no reading explains both numbers.** 16-versus-19 looked like
  the Luna caption gradient and was not: a stretch explains both, so the level is
  `measured` with the stretch recorded. Reaching for `contested` because two numbers
  differ is the failure this rule already warns about, run in the other direction.
- **A magnified figure is not a useless figure.** Figure 5-7 is exactly 2×, every era
  pixel a clean 2×2 block, so dividing by two makes it a fifth confirmation of the box
  footprint. Dismissing it as "artwork usable, dimensions not" threw away a free
  cross-check. Test the magnification factor before discarding; its *colours* are a
  different family and those genuinely are unusable.
- **Enumerating a bevel per side describes the pixels and hides the model.** Platinum's
  frame read as "six 1px steps whose highlight and shadow swap between left/top and
  bottom/right" — true, and it implies four hand-maintained lists. It is two closed bevel
  rings, one outset and one inset, lit from a single top-left source, which generates all
  four sides from two variable sets.
- **A drop shadow notches both of its free ends.** System 1's is remembered for the
  top-right notch, so that is the one that gets looked for. Platinum's bottom-left arm is
  inset by the same 2px in every figure, and its colour tracks the frame line — black
  when active, `#555555` when inactive — so an unconditional black shadow draws one under
  a deactivated window that never had it.
- **Prose and pixels can both be right and still not be the same claim.** Apple documents
  a 19px title bar three ways; the figures measure a 22px band and a 20px interior, and
  *both* 19-row candidates inside it cut through a bevel ring while both sum to 22. The
  arithmetic cannot choose, so 19 is `documented`, 20 is `measured`, and the placement is
  `derived`. Counting the same white pixel row as frame on one edge and as title bar on
  another is what made the wrong sum appear to close.
- **"Identical" needs a byte-diff, not an impression.** The close, zoom and collapse
  boxes share a chisel, an inner bevel and a ramp and differ by 11, 18 and 15 pixels —
  the glyph, which is the entire point of the widget. Same for the layer count: the two
  layers a three-layer reading omits are 16 pixels of a 167-pixel box, and without them
  the dark ring lands straight on the ramp.
- **An empty control still draws its parts.** A Platinum scroll bar with nothing to
  scroll draws both arrows in `#888888` — the same glyph artwork recoloured — and has two
  distinct empty states, active and inactive. "No arrows" was the reading that looked
  obvious and was wrong in the direction nothing would catch.
- **A slot one variant fills with colour and another fills with grey is not a ramp step.**
  Platinum's accent is four steps by role. The apparent fifth is a 4px grip cap that is
  `#CCFFCC` in the green thumb and a **grey** in the lavender one.

### The stipple ends at Platinum
- System 1's `notPatBic` and Windows 3.1's `GrayString` knock a 50% checkerboard out of
  the glyph. **Mac OS 8 does not**: disabled text is a solid `#888888`, the same glyph
  artwork in a different ink, proven by the same parity discriminator — 127 ink pixels
  split 64/63 across `(x + y)`, against the 37-on-one-parity that proved the checkerboard
  in Microsoft's bitmap. So the mechanism governs **System 1 and Windows 3.1 only**, and
  a Platinum skin that inherited it would read four years out of date. Same reason Windows
  95 dropped it: by 1997 8-bit colour is assumed.

### Fonts carry history their licence does not
- **A font's embedded copyright notice can predate its licence.** ChicagoFLF's name ID 0
  reads `(c)1990-92 by Richard A. Ware. All Rights Reserved.` — the original Fluent Laser
  Fonts line. Robin Casady placed it in the public domain after Casady & Greene closed and
  rights reverted, and never wrote that back into the name table. The file looks encumbered
  and is not. **Retain the notice in the subset rather than stripping it**: it is the
  evidence a licence audit needs to explain the discrepancy.
- **Score a substitute against the era's own rasterisation, not against a specimen sheet.**
  ChicagoFLF at 12px matches Apple's figures to a mean 0.02px ink-width error — and doing
  the comparison that way is what revealed that one figure is Charcoal rather than Chicago.
- **Apple's "based on Chicago's metrics" does not mean the advances match.** Charcoal
  diverges on four metrics, two of them advances, netting 2px over six glyphs. Shared
  design size and vertical metrics is not metric interchangeability.
- **`document.fonts.ready` does not load a face that only `<canvas>` uses.** Nothing in the
  DOM renders with it, so it is never fetched. The first comparison sheet silently
  rasterised every specimen in the fallback serif and reported the candidate 23px too
  narrow — a wrong measurement that looked like a real result. Use `document.fonts.load()`
  and assert `document.fonts.check()` before drawing.

### A union member no era has declared is untested code
- `MinimizeStyle` carried `'collapse'` from phase 1, so the window manager's minimize path
  was written for the two styles that existed and got all three of its decisions wrong for
  the third: it hid the frame, moved focus off it, and re-expanded it on focus. When a
  union gains a member, every site that switches on it is unverified until an era declares
  it. The distinction the WM actually wanted was never "is it minimized?" but "is it gone
  from the screen?" — the same question until it wasn't.
- **Verification has to fit the machine.** Workflow concurrency is `min(16, cores − 2)`,
  which is **2** on a 4-core container, so a 15-agent extraction plan cannot finish. Four
  adversarial lenses plus a critic did, and refuted 29 of 57 claims. Also: interrupting a
  turn kills the workflow agents it spawned, and the journal keeps saying `started`
  forever — check transcript mtimes before concluding a run is merely slow.
### Two agreeing secondary sources still lose to the era's own pixels (System 1)
- `StandardWDEF.a` plus Executor agreeing exactly is a real corroboration and it was still
  wrong in five places, because both describe the *drawing code* and a reader
  reconstructing geometry from drawing code fills gaps with plausible arithmetic. Stripes
  start at `left+2` not `left+1`, the close box is 9px in not 10px, the size box is a 16×16
  box carrying an 11×11 icon not a 14×14 box, the scroll trough is `ltGray` 25% not the
  desktop's 50%, and the shadow notches *both* the top-right and the bottom-left corner.
  Prefer the output of the code running over a description of the code.
- Collapsing two patterns into one is the commonest classic-Mac error and it is invisible
  until measured: the desktop and the scroll bar trough are different QuickDraw patterns
  (50% checkerboard on a 1px cell vs `ltGray` on a 4×2 cell). Measured 50.0% and 25.2%.
- A two-colour bitmap needs no calibration argument. Any resample introduces a third value,
  so `#000000` + `#FFFFFF` and nothing else *is* the proof of 1:1 — a stronger argument than
  XP's placement scale or Tiger's push-button widths. But allow exactly one flat illustrator
  tone under 5%, reported with its bbox: resampling produces dozens of blend values along
  every edge, a callout box produces one tone in one rectangle.
- `box-shadow: 1px 1px 0 0` *is* "the frame's edges translated (+1, +1)", so it reproduces
  both corner notches for free. `border-right` + `border-bottom` produces neither and the
  square corners look plausible enough that nobody questions them.
- Three figures agreeing and a fourth that is structurally incapable of answering is a
  majority vote, not a measurement. The bottom-left shadow corner ships as a provenance note
  stating the disagreement, because picking the value that matched the code already written
  is the exact failure this project exists to avoid.

### An absent button is not a refused command
- A skin cannot express "this era has no maximize" by emitting no button:
  `toggleMaximize` is still reachable from the keymap, the window chrome menu and any app
  call, and each path produced a maximized System 1 window with no way back.
  `maximizeSemantics: 'none'` in `ChromeMetrics` is what makes the window manager refuse it.
  Ask "can a skin even express this" before "should a skin express this".
- Hardcoded accelerator literals in shared code (`accel: 'Alt+F7'`) were a latent lie in
  every era and a visible one in 1984, where the keyboard has no Control, no Option, no
  Escape, no arrows and no function keys. `Shell.accelFor` derives the label from the actual
  binding, so a menu cannot disagree with the keyboard and a skin that binds nothing shows
  nothing.

### Chromium's LCD text antialiasing is not defeatable, so assert the claim that is true
- It tints the edge pixels of glyphs that are already exactly on the pixel grid.
  `-webkit-font-smoothing: antialiased`, `-webkit-font-smoothing: none`, `font-smooth: never`
  and `text-rendering: optimizeSpeed` are all no-ops on it. "Exactly two colours" is false
  in this renderer and no CSS makes it true.
- Loosening a threshold until a false assertion passes yields a test that asserts nothing.
  Restate the claim instead: **there is no grey in a 1-bit UI** — every pixel luma <40 or
  >208. A flat grey fill lands at ~128 and fails; a 50% checkerboard sampled at a fractional
  scale averages to ~128 and fails, which is the failure the integer viewport exists to
  prevent. The fringe bound is a separate assertion, not a tolerance on the first.
- Still fix the real bug the false test found: CSS centring distributes free space without
  rounding, so a title of opposite parity to its bar lands on a half pixel. `Math.floor`,
  because `StandardWDEF` centres with integer division and that truncates.

### Scale an overlay in place; do not re-parent it to inherit a transform
- Re-parenting menus into `.desktop` so they inherited the viewport scale worked and was
  wrong: `.desktop` is inside the scaled, clipped viewport, so an overhanging menu gets
  clipped by the screen edge and a menu opened from a shell region outside the viewport is
  positioned in the wrong coordinate space entirely. Publish `--display-scale` on the shell
  root and `transform: scale()` the overlay where it already lives.
- Do not "fix" the positioner to compensate. Dividing by the scale in
  `MenuController.position()` was reverted in full — positioning stays in root coordinates
  and the transform handles the rest, which is the only version that composes with a sibling
  session's work without either session knowing about the other.
- A `:root` fallback block in a skin masks exactly this class of bug. `skin.css` ships with
  none and carries a comment saying why, because the absence otherwise reads as an omission.

### Extract the shared assertion, do not copy it
- "Use Win 3.1's stipple construction unchanged" is satisfiable in letter by copying the
  helper into a second spec, and that breaks it in fact — two copies drift and the one that
  drifts is the one nobody looks at. `measureParity` moved to `test/browser/stipple.ts` and
  both eras import it, so one instrument holds two eras and the source to one standard.

### Two measurements that cannot both be true still both ship (the menu bar)
- The title box is the string plus 10px either side and the stride is the string plus 15
  — measured separately, each exact on its own figure, and together they mean adjacent
  boxes overlap by 5px. Rects that partition a bar cannot overlap. Every attempt to solve
  it produced a half pixel (7.5 from two directions; 5 on one figure and 6 on the other),
  which no 1984 Toolbox used.
- Ship both exactly and record the overlap as derived. It is unobservable — only one title
  is ever inverted — so splitting the difference would make two *visible* measurements
  wrong to hide one *invisible* inconsistency.
- A construction beats a number: the title box ends on row 18, so opening the menu at the
  title's bottom rather than the bar's puts the menu's 1px top border on the bar's rule for
  free, and the inversion, the rule and the menu's left border become one run of ink.
- Only a figure with a menu *pulled down* shows a title box at all; an unhighlighted title
  is just its string. Look for the figure in the interaction state before concluding a
  value is unmeasurable.

### Coverage is part of verifying a substitute face, and the failure is silent
- ChiKareGo2 has no U+2026 and no U+2014. The font comparison could not have caught it: it
  rendered the target strings and measured their shapes and widths, so a character none of
  them contained was invisible to it.
- A missing glyph does not fail loudly — it falls back to the browser's default face, whose
  fractional advance takes every glyph *after* it in the run off the pixel grid. The text
  still appears; it is just no longer 1-bit. `Files — …` measures 311.28px, `Files - …`
  measures 306px.
- `document.fonts.check()` over every string a skin renders is the instrument. Add it when
  the face is chosen, not after an era gate catches the fringe.

### "Reserved" was one number doing two jobs
- A shell region is a child of the desktop, so its claim is in logical era pixels: it
  shrinks the work area and must not move the desktop, which is already around it. Chrome
  anchored to the host — the harness status strip — is in CSS pixels and *outside* the
  desktop, so it must also move a fixed-mode desktop clear of itself. Summing them cannot
  express either, and three device rows of antialiased strip text bled into a 512x342
  desktop and read as grey in an era that has none.
- The gate that caught it was diagnosed by running it on the commit before the merge, not
  by adjusting the number — the same discipline the perf gate needed. It passed there,
  which is what proved the merge and not the menu bar was the cause.
- A bug can be created by *correcting* something: the strip only collided once Tiger gave
  it the `data-edge` that positions it properly. Before that it was painting underneath the
  desktop, invisible, and nobody had noticed it was misplaced.

### An era's menus may only promise what the keymap binds
- A **disabled** item promises nothing, so it may carry its historical accelerator — that is
  how System 1's Edit menu keeps ⌘Z ⌘X ⌘C ⌘V with none of them bound. An **enabled** item's
  accelerator must come from `accelFor`, and a test asserts that split rather than leaving it
  to judgement.
- Where neither works, omit the item. Get Info, Duplicate and Eject are absent from the File
  menu because showing ⌘I ⌘D ⌘E would advertise unbound chords and showing them bare would
  misrepresent the era. Omission is the honest third option.
- `ShellRegionHost` had no `accelFor`, so a region's menus had to write chords as literals —
  the same defect one layer down from the one already fixed in the shell. Check whether a
  fix's *reason* applies to every surface that does the same job, not just the one that
  showed the symptom.

### "It is shared" answers who changes it, not whether it should change
- The em dash in the harness's window titles was flagged as not-mine-to-change because five
  other eras rendered it fine. That was a claim about ownership standing in for a claim
  about correctness, and the correctness question had not been asked: **no** era in this
  project used U+2014 in a window title — the classic Mac, Win 3.1 and XP all used " - " or
  nothing. It was wrong in all six, so removing it is a harness fix rather than five eras
  narrowed to suit one.
- Raising it was still right; stopping at "shared, therefore untouchable" was not. Ask
  whether every consumer actually wanted the thing before concluding that only one is
  complaining.

### Adding an accessor is half the fix; the call sites are the other half
- `ShellRegionHost.accelFor` was added for System 1's menu bar and Tiger's bar was left on
  its literals because they were right for Tiger. Correct-today is not what the accessor
  provides — four of the five were right only until a binding moved, which happened one era
  later. When a fix's *reason* applies to an existing call site, switch it then, not when
  it finally breaks.
- The switch is also what audits the literals. `Force Quit… ⌘⌥Esc` was an enabled item
  advertising a chord nothing binds, in an era whose own suite had been green for weeks;
  routing it through the accessor is what made the absence visible.
