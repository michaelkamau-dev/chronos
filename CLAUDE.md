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
