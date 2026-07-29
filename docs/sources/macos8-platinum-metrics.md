# Mac OS 8 Platinum — measured metrics

**Source:** *Mac OS 8 Human Interface Guidelines*, Apple Computer Inc., 9/2/97.
Retrieved from `interface.free.fr/Archives/Apple_HIGOS8_Guidelines.pdf`.
Page numbers below refer to that document's own pagination.

All values are `level: 'documented'` — stated in Apple's own text, not measured
from a screenshot. Figure references are noted where the number is carried by a
dimensioned drawing rather than prose; those still need the PDF's embedded
figures to confirm.

---

## Window chrome

| Metric | Value | Page |
|---|---|---|
| Document window title bar height | **19px** | 103 |
| Utility window title bar (with title) minimum | 19px — must match document window | 103 |
| Zoom box position | Right side of title bar, immediately left of the collapse box | 104 |
| Zoom box variants | Full, vertical, horizontal — each with active and inactive states | 104–105 |
| Collapse box position | Far right of title bar | 103 |
| Close box position | Far left of title bar | 64 |
| Drag region | Narrow gray frame around **all sides** of the content region — not just the title bar | 100 |
| Inactive window frame | Flat light gray, recedes; active frame is darker with color accents | 99 |
| Utility window drag region fill | Crosshatch pattern | 102 |
| Content area default | White on all systems unless user assigns color | 99 |

Note on the drag region: Platinum lets you drag a window from any edge, and
Apple explicitly warns not to assume a fixed size or appearance for that region
because it varies with Appearance settings. Worth encoding as a metric the skin
declares rather than a constant.

## Controls

| Control | Value | Page |
|---|---|---|
| Push button height | 20px | 72 |
| OK / Cancel button | 20px × 58px | 73 |
| Push button text inset | min 8px each side, excluding black border | 72–73 |
| Default ring | Outset 3px from button; excluded from base resource size | 72 |
| Push button states | normal, pressed, disabled (3 only) | 22 |
| Checkbox / radio square or circle | 12px × 12px | 75 |
| Checkbox / radio clickable region height | 18px | 76 |
| Gap, control to text label | 5px (assuming capital M) | 75 |
| Square bottom relative to text baseline | 2px below baseline of 12pt Chicago | 75 |
| Radio / checkbox states | on, off, mixed × normal, pressed, disabled | 25, 28 |
| Pop-up menu button height | 20px (18px with small system font) | 78 |
| Edit text field height | 22px standard, 20px when aligning to a 20px control | 82 |
| Edit text frame border | 2px | 41 |
| List box frame | 2px, inside lines shared with scroll bar outside lines | 39 |
| Image well frame | 2px, recessed, white fill | 47 |
| Progress indicator height | 12px, variable width | 83 |
| Help button | 21px high × 20px wide bevel button | 86 |
| Bevel widths | small 2px, medium 3px, large 4px | 29 |
| Bevel button states | 7 total — off, pressed-was-off, on, pressed-was-on, mixed, disabled-off, disabled-on | 30 |
| Tool palette buttons | 22px × 22px with small bevel fits a 16px × 16px icon | 103 |
| Primary group box border | 2px — 1px white line adjacent to 1px dark gray line, etched | 47, 80 |
| Secondary group box border | 1px | 47 |
| Separator line | 2px — top pixel is the line, bottom pixel is the engrave | 50 |

## Scroll bars

| Metric | Value | Page |
|---|---|---|
| Arrows | Solid black when active | 40 |
| Scroll indicator color | Takes the user's accent color from Appearance control panel | 40 |
| Construction | Shaded gray rectangle, black arrow in a box at each end | 40 |

Width is **not stated in prose** — Figure 2-26 carries it. Still unverified.

## Spacing

| Rule | Value | Page |
|---|---|---|
| Between clickable items | 4px minimum, 6px preferred (leaves room for focus rings) | 71 |
| Item to window/dialog edge | 4px minimum (utility windows may go to 1px) | 71 |
| Between control groups | 16px | 71 |
| Vertically stacked push buttons | 10px | 73 |
| Horizontally placed push buttons | 12px | 74 |
| Push button to dialog edge | 12px | 74 |
| Bevel buttons, horizontal | 12px minimum | 74 |
| Bevel button bottom to title top | 6px | 74 |
| Radio / checkbox, vertical | 6px minimum visible | 76 |
| Radio / checkbox, horizontal | 12px minimum | 76 |
| Preceding text to first button | 5px | 76 |
| Pop-up menus, vertical | 6px minimum | 78 |
| Edit text field to its pop-up button | 4px | 79 |
| Stacked edit text fields | 6px minimum | 83 |
| Group box side margins, inside | 10px | 82 |
| Group box top margin, inside | 12px | 82 |
| Group box bottom margin, inside | 10px | 82 |
| Group box to adjacent groups, horizontal | 10px | 82 |
| Group box to adjacent groups, vertical | 12px | 82 |
| Nested secondary group box inset | 10px from primary's inside border | 81 |
| Disclosure triangle to text | 5px, ignoring the gray shadow | 84 |
| Static text baseline to item below | 6px (allows for focus ring) | 85 |
| List box title baseline to black line | 6px | 86 |

## Type

| Metric | Value | Page |
|---|---|---|
| Default system font | **Charcoal** | 17 |
| Metric standard for layout | **Chicago 12** — Charcoal is based on Chicago's metrics | 17 |
| Chicago 12 overall height | 16px; resource rect for Chicago text should be 16px | 70 |
| Static text field height | 16px, to accommodate Chicago 12 | 84 |
| Standard character left side bearing | 2px | 70 |
| `J`, `T`, `j` | Outdent 1px left of standard | 70–71 |
| `I` and `1` | 3px preceding, one more than standard | 71 |
| Small system font metric basis | **Geneva 10** | 69 |
| Geneva 10 baseline allowance | 14px visually | 71 |
| Headings | Emphasized small system font, used sparingly | 69 |
| Alert box label | Bold system font | 61 |
| Alert box narrative | Plain small system font | 61 |
| View / tab label sizes | Tab controls documented at both 12pt and 10pt | 43 |

The Charcoal/Chicago split matters for the skin: **Charcoal is what shipped, but
Chicago is the metric basis and every figure in the HIG uses Chicago.** Since
ChicagoFLF is already the System 1 substitute and is public domain, Mac OS 8 can
reuse it and be metrically correct even though it isn't the visually correct face.
That converts §7's "Charcoal — none exists" from a blocker into a documented,
deliberate substitution.

## Color and accent

| Metric | Value | Page |
|---|---|---|
| Default focus ring | Lavender; user-changeable in Appearance control panel | 66 |
| Accent color applies to | Scroll bar indicators, progress indicators, slider indicators, focus rings | 100 |
| Movable alert box | Red highlights on the title bar | 61 |
| Non-movable alert box | Red border around the content placard | 62 |
| Modal dialog background | Placard-like | 60 |

## Menus

| Metric | Value | Page |
|---|---|---|
| Menu bar | 3D Apple logo, beveled edges, antialiased corners, etched dividers | 91 |
| Contextual menu offset | Upper-left corner 1px right and 1px down from click; flips to upper-right when too wide | 94 |
| Sticky menu timeout | 15 seconds without a selection | 93 |
| Sticky menu threshold | User-defined double-click interval | 92 |
| Help menu position | Always last from the left | 92 |
| Contextual menu first item | Always Help — disabled if unavailable, but always shown | 94 |

## Behaviors worth encoding

- **Collapse box:** content region hides, title bar stays visible and active.
  Option-click collapses or expands *all* windows at once. A user preference
  makes double-clicking the title bar collapse instead. (p. 103–104)
- **Modal dialog rejection:** clicking another window or the desktop beeps and
  does nothing else. (p. 60) — matches the plan's `inert` + era-beep design.
- **Push button tracking:** stays highlighted while pressed; unhighlights if the
  pointer leaves the button; rehighlights on return; releasing outside does
  nothing. (p. 22)
- **Keyboard-activated buttons** highlight for 8 ticks (~1/8 second). (p. 22)
- **Cmd-period and Escape** always map to Cancel. (p. 22)
- **Disclosure triangle in list views:** Cmd-Right opens, Cmd-Left closes. (p. 39)
- **Control panel window size:** preferred max 400×300, absolute max 492×340. (p. 109)

---

## Still unverified after this document

Apple's prose gives controls and spacing exhaustively but never states these in
text — they exist only inside the figures:

- Window frame widths (left / top / right / bottom)
- Pinstripe period and its two grays
- Chiselled bevel layer order and colors
- Close / zoom / collapse box pixel dimensions
- Scroll bar width
- Menu bar height
- Window shadow geometry
- Grow box dimensions

**The fix is the same one §7 proposes for Tiger.** Figure 5-3 "Structural
components of standard document windows" is a labeled full document window, and
Figure 5-1 is an active/inactive pair. Extract those XObjects from the PDF and
measure them, calibrated against the documented 19px title bar and 20px push
button. That gives Apple's own pixels.

**So: still put the actual PDF in `docs/sources/`.** This table closes the
control and spacing half of the gap from prose alone; the figures close the
chrome half, and they need the file.
