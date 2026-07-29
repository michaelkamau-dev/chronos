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
